import os
import re
import cv2
import numpy as np
import logging
import threading
from datetime import datetime
from ultralytics import YOLO
import torch

from core.ocr import LicensePlateOCR
from core.red_light_logic import RedLightDetector
from publisher import send_violation
from core.detection import analyze_frame
from core.tracking import VehicleTracker
from core.rules import is_violation, build_violation_payload

# ================== LOGGING SETUP ==================
# KHÔNG dùng basicConfig vì Ultralytics đã chiếm root logger từ lúc
# "from ultralytics import YOLO" chạy. Thay vào đó, tạo logger riêng
# với handler riêng, không phụ thuộc root.

import sys


def setup_logger(name: str, level=logging.INFO) -> logging.Logger:
    """Tạo logger riêng có handler stdout, không bị thư viện ngoài ghi đè."""
    lg = logging.getLogger(name)
    lg.handlers.clear()                        # Xoá handler cũ nếu có
    lg.setLevel(level)
    lg.propagate = False                       # Không đẩy lên root logger

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)
    handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    ))
    lg.addHandler(handler)
    return lg


# Tạo logger cho main ("traffic") và publisher ("publisher" — khớp __name__)
logger = setup_logger("traffic")
setup_logger("publisher")

# Giảm noise từ thư viện ngoài (không ảnh hưởng logger của mình)
logging.getLogger("ultralytics").setLevel(logging.WARNING)
logging.getLogger("paddleocr").setLevel(logging.WARNING)
logging.getLogger("ppocr").setLevel(logging.ERROR)
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("PIL").setLevel(logging.WARNING)


# ================== CẤU HÌNH ==================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")
OUTPUT_DIR = os.path.join(BASE_DIR, "output_violations")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Ngưỡng phát hiện
LP_CONF_THRESHOLD = 0.50
HELMET_CONF_THRESHOLD = 0.35
NO_HELMET_CONF_THRESHOLD = 0.70
TL_CONF_THRESHOLD = 0.15
MOTO_TRACK_CONF = 0.25

# Filter hình dạng biển số
LP_MIN_AREA = 800
LP_MIN_WIDTH = 25
LP_MIN_HEIGHT = 12
LP_RATIO_MIN = 1.0
LP_RATIO_MAX = 6.0

TRACK_TIMEOUT_FRAMES = 60       # giữ track lâu hơn (30 → 60)

# Class names biển số (tuỳ model)
LP_CLASS_NAMES = {"lp", "license_plate", "license-plate", "plate",
                  "bienso", "bien_so"}

# Regex biển VN chuẩn: 2 số + 1-2 chữ (+1 số) + 4-5 số
PLATE_REGEX = re.compile(r'^(\d{2})([A-Z]{1,2}\d?)(\d{4,5})$')


# ================== HELPER FUNCTIONS ==================

def compute_iou(boxA, boxB):
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    interArea = max(0, xB - xA) * max(0, yB - yA)
    boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
    return interArea / float(boxAArea + boxBArea - interArea + 1e-5)


def is_valid_plate_box(x1, y1, x2, y2):
    """Lọc bbox theo hình dạng — bỏ bánh xe, ống pô, gương..."""
    w, h = x2 - x1, y2 - y1
    if w < LP_MIN_WIDTH or h < LP_MIN_HEIGHT:
        return False
    if w * h < LP_MIN_AREA:
        return False
    ratio = w / float(h + 1e-5)
    return LP_RATIO_MIN <= ratio <= LP_RATIO_MAX


def is_helmet_any_color(crop):
    """
    ⚠️ CẢNH BÁO: Hàm này dễ gây false negative vì head_crop chứa cả mặt/tóc/áo.
    Khuyến nghị: KHÔNG dùng hàm này trong pipeline chính.
    Hiện tại pipeline không gọi hàm này.
    """
    if crop is None or crop.size == 0:
        return False

    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    h_ch, s_ch, v_ch = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    total = crop.shape[0] * crop.shape[1]

    colored_pixels = np.sum((s_ch > 80) & (v_ch > 60))
    white_pixels = np.sum((v_ch > 150) & (s_ch < 100))
    dark_pixels = np.sum((v_ch < 80) & (v_ch > 30))

    helmet_ratio = (colored_pixels + white_pixels + dark_pixels) / float(total + 1e-5)
    return helmet_ratio > 0.35
    """
    Phát hiện mũ bảo hiểm BẤT KỲ MÀU NÀO (trắng, đỏ, xanh, vàng, đen...).
    Logic: mũ bảo hiểm thường có
      - Màu đậm (saturation cao): đỏ, xanh, vàng
      - Hoặc sáng chói (trắng, bạc): V cao, S thấp
      - Hoặc đen tuyền: V thấp, S thấp
    """
    if crop is None or crop.size == 0:
        return False

    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    h_ch, s_ch, v_ch = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    total = crop.shape[0] * crop.shape[1]

    # 1. Màu đậm — đỏ, xanh, vàng... (S cao, V đủ sáng)
    colored_pixels = np.sum((s_ch > 80) & (v_ch > 60))

    # 2. Trắng/sáng — mũ trắng, bạc (V cao, S thấp)
    white_pixels = np.sum((v_ch > 150) & (s_ch < 100))

    # 3. Đen bóng — mũ đen (V thấp, nhưng không quá tối)
    dark_pixels = np.sum((v_ch < 80) & (v_ch > 30))

    helmet_ratio = (colored_pixels + white_pixels + dark_pixels) / float(total + 1e-5)

    return helmet_ratio > 0.35
    """Phát hiện mũ bảo hiểm trắng qua tỉ lệ pixel sáng."""
    if crop is None or crop.size == 0:
        return False
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    v, s = hsv[:, :, 2], hsv[:, :, 1]
    white = np.sum((v > 135) & (s < 90))
    total = crop.shape[0] * crop.shape[1]
    return (white / float(total + 1e-5)) > 0.35


def parse_and_normalize_plate(raw_text):
    """
    Chuẩn hoá biển số VN — CHỈ nhận khi match regex chuẩn.
    Trả về "" nếu không chắc (thà bỏ sót còn hơn lưu rác).
    """
    if not raw_text:
        return ""
    clean = "".join(c for c in raw_text.upper() if c.isalnum())
    if not (7 <= len(clean) <= 9):
        return ""

    # Case 1: format chuẩn
    m = PLATE_REGEX.match(clean)
    if m:
        city, series, tail = m.groups()
        return f"{city}{series}-{tail}"

    # Case 2: OCR đọc ngược ("1163350A4" → "50A411633")
    m_rev = re.match(r'^(\d{4,5})(\d{2}[A-Z]{1,2}\d?)$', clean)
    if m_rev:
        candidate = m_rev.group(2) + m_rev.group(1)
        m2 = PLATE_REGEX.match(candidate)
        if m2:
            city, series, tail = m2.groups()
            return f"{city}{series}-{tail}"

    # ❌ Không match → bỏ (không fallback bừa)
    return ""


def read_plate_from_crop(ocr_model, crop, bike_id=None, context="det"):
    """Đọc biển từ crop, log rõ, trả về (text_format, conf)."""
    if crop is None or crop.size == 0:
        return "", 0.0

    raw_str, conf = ocr_model.read_plate(crop)
    if not raw_str:
        return "", 0.0

    formatted = parse_and_normalize_plate(raw_str)
    if bike_id is not None:
        status = f"✅ {formatted}" if formatted else "❌ BỎ (format sai)"
        logger.info(f"[OCR {context}] ID={bike_id} raw='{raw_str}' "
            f"conf={conf:.2f} → {status}")
    return formatted, conf


# ================== RETROACTIVE UPDATE ==================

def retroactive_update_violation(bike_id, new_plate, lp_crop, frame, bike_box,
                                 bike_recorded_violations,
                                 recorded_plate_violations,
                                 OUTPUT_DIR):
    """
    Cập nhật vi phạm cũ (đã ghi 'CHUA_RO_BS') khi OCR đọc được biển số.
    - Xoá file bằng chứng cũ
    - Ghi lại file mới có tên biển số đúng
    - Gửi lại API
    """
    if bike_id not in bike_recorded_violations:
        return

    clean_lp = new_plate.replace("-", "").replace(" ", "")
    if len(clean_lp) < 7:
        return

    bx1, by1, bx2, by2 = bike_box
    h_frame, w_frame = frame.shape[:2]

    for v_type, prev_len in list(bike_recorded_violations[bike_id].items()):
        if prev_len != 0:
            continue
        if (clean_lp, v_type) in recorded_plate_violations:
            continue

        # Xoá file cũ
        for suffix in ["", "_LP_"]:
            old_path = os.path.join(
                OUTPUT_DIR,
                f"violation_ID{bike_id}_{v_type}{suffix}CHUA_RO_BS.jpg"
            )
            if os.path.exists(old_path):
                os.remove(old_path)
                logger.info(f"[Retro] Xoá file cũ: {os.path.basename(old_path)}")

        # Ghi file mới
        crop_pad = 40
        crop_y1 = max(0, by1 - int((by2 - by1) * 1.0) - crop_pad)
        crop_y2 = min(h_frame, by2 + crop_pad)
        crop_x1 = max(0, bx1 - crop_pad)
        crop_x2 = min(w_frame, bx2 + crop_pad)
        evidence_img = frame[crop_y1:crop_y2, crop_x1:crop_x2]

        evidence_path = os.path.join(
            OUTPUT_DIR, f"violation_ID{bike_id}_{v_type}_{clean_lp}.jpg"
        )
        lp_evidence_path = os.path.join(
            OUTPUT_DIR, f"violation_ID{bike_id}_{v_type}_LP_{clean_lp}.jpg"
        )

        if evidence_img.size > 0:
            cv2.imwrite(evidence_path, evidence_img)
        if lp_crop is not None and lp_crop.size > 0:
            cv2.imwrite(lp_evidence_path, lp_crop)

        bike_recorded_violations[bike_id][v_type] = len(clean_lp)
        recorded_plate_violations.add((clean_lp, v_type))

        vn_name = ("VƯỢT ĐÈN ĐỎ" if v_type == "RED_LIGHT"
                   else "KHÔNG ĐỘI MŨ BẢO HIỂM")
        logger.info("=" * 65)
        logger.info(f"🔄 CẬP NHẬT BIỂN SỐ VI PHẠM (Xe ID: {bike_id})")
        logger.info(f"-> Biển số xe   : {new_plate}")
        logger.info(f"-> Lỗi vi phạm  : {vn_name}")
        logger.info(f"-> Bằng chứng xe: {evidence_path}")
        logger.info(f"-> Ảnh biển số  : {lp_evidence_path}")
        logger.info("=" * 65)

        # Gửi lại API
        light_val = "red" if v_type == "RED_LIGHT" else None
        threading.Thread(
            target=send_violation,
            args=(bike_id, new_plate, v_type, 0.95,
                  datetime.now().isoformat(), evidence_path),
            kwargs={"light_status": light_val,
                    "plate_image_path": lp_evidence_path},
            daemon=True,
        ).start()


# ================== PIPELINE CHÍNH ==================

def run_traffic_system(video_path):
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    logger.info(f"--> Đang chạy AI trên: {device} "
                f"({torch.cuda.get_device_name(0) if device == 'cuda' else 'CPU'})")
    logger.info("[1/3] Đang nạp các mô hình AI...")

    # --- Nạp model ---
    try:
        moto_model = YOLO("yolov8n.pt").to(device)
        helmet_model = YOLO(os.path.join(MODELS_DIR, "helmet_lp_best.pt")).to(device)
        lp_model = YOLO(os.path.join(MODELS_DIR, "my_lp_model.pt")).to(device)
        tl_model = YOLO("yolov8n.pt").to(device)
    except Exception as e:
        logger.exception(f"Lỗi nạp model YOLO: {e}")
        return

    logger.info("Đang nạp PaddleOCR...")
    try:
        ocr_model = LicensePlateOCR()
    except Exception as e:
        logger.exception(f"Lỗi nạp PaddleOCR: {e}")
        return

    logger.info("[2/3] Nạp mô hình thành công!")
    tracker = VehicleTracker(screen_threshold_ratio=0.8)

    # Ép kiểu video source
    if isinstance(video_path, str) and video_path.isdigit():
        video_path = int(video_path)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        logger.error(f"Không thể mở video: '{video_path}'")
        logger.error("-> Kiểm tra biến VIDEO_PATH trong docker-compose.yml")
        return

    violation_count = 0
    logger.info("[3/3] Bắt đầu quét video...")

    # --- State per bike ---
    bike_plates = {}
    bike_lp_crops = {}
    bike_recorded_violations = {}
    bike_last_seen = {}
    recorded_plate_violations = set()          # per-bike dedup (giữ nguyên)
    global_recorded_plates = set()             # global dedup mới: (plate, v_type)

    # --- Red-light detector ---
    ret_test, frame_test = cap.read()
    if ret_test:
        h_f, w_f, _ = frame_test.shape
        ty = int(h_f * tracker.screen_threshold_ratio)
        red_light_ai = RedLightDetector(stop_line_coords=[(0, ty), (w_f, ty)])
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    else:
        logger.error("Không đọc được frame đầu tiên từ video.")
        cap.release()
        return

    motor_positions_history = {}
    frame_count = 0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            logger.info("Video đã kết thúc hoặc mất kết nối camera.")
            break
        frame_count += 1

        # Bỏ frame lẻ để tăng tốc
        if frame_count % 2 != 0:
            continue

        annotated_frame = frame.copy()
        h_frame, w_frame, _ = frame.shape
        threshold_y = int(h_frame * tracker.screen_threshold_ratio)

        cv2.line(annotated_frame, (0, threshold_y), (w_frame, threshold_y),
                 (0, 0, 255), 3)
        cv2.putText(annotated_frame, "Vach Kiem Tra Vi Pham",
                    (20, threshold_y - 15), cv2.FONT_HERSHEY_SIMPLEX,
                    1.0, (0, 0, 255), 3)

        # ============ DETECT: HELMET + LP ============
        helmet_detections = analyze_frame(helmet_model, frame,
                                          conf=HELMET_CONF_THRESHOLD,
                                          imgsz=640, device=device)
        lp_detections_aux = analyze_frame(lp_model, frame,
                                          conf=LP_CONF_THRESHOLD,
                                          imgsz=640, device=device)

        helmet_dets = []
        no_helmet_dets = []
        lp_dets = []
        raw_no_helmet_dets = []

        # --- Từ helmet_lp_best.pt ---
        for det in helmet_detections:
            cls_name = det["class_lower"]
            x1, y1, x2, y2 = det["bbox"]

            if cls_name in ["helmet", "with_helmet", "with-helmet"]:
                helmet_dets.append(det)
                cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 255, 0), 3)
            elif cls_name in ["no helmet", "no_helmet", "without_helmet",
                              "without-helmet", "no-helmet"]:
                raw_no_helmet_dets.append(det)
            elif cls_name in LP_CLASS_NAMES:
                if is_valid_plate_box(x1, y1, x2, y2):
                    det["_source"] = "helmet_lp"
                    lp_dets.append(det)
                else:
                    logger.debug(f"[LP Filter] Bỏ box shape sai: "
                                 f"({x1},{y1})-({x2},{y2}) conf={det['conf']:.2f}")

        # --- Từ my_lp_model.pt (dedupe IoU > 0.5) ---
        for det in lp_detections_aux:
            x1, y1, x2, y2 = det["bbox"]
            if not is_valid_plate_box(x1, y1, x2, y2):
                continue
            dup = False
            for existing in lp_dets:
                if compute_iou(det["bbox"], existing["bbox"]) > 0.5:
                    if det["conf"] > existing["conf"]:
                        existing.update(det)
                    dup = True
                    break
            if not dup:
                det["_source"] = "lp_model"
                lp_dets.append(det)

        # ============ LỌC NO-HELMET ============
        for nh in raw_no_helmet_dets:
            x1, y1, x2, y2 = nh["bbox"]
            conf = nh["conf"]
            h_w, h_h = x2 - x1, y2 - y1
            aspect = h_h / float(h_w + 1e-5)

            # 1. Confidence threshold
            if conf < NO_HELMET_CONF_THRESHOLD:
                continue

            # 2. Aspect ratio hợp lệ cho vùng đầu
            if not (0.4 <= aspect <= 3.0):
                continue

            # 3. Nếu CÓ helmet detection overlap cao → có mũ, bỏ qua
            if any(compute_iou(nh["bbox"], h["bbox"]) > 0.30 for h in helmet_dets):
                continue

            # ✅ BỎ block is_helmet_any_color — không dùng nữa
            no_helmet_dets.append(nh)
            cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 0, 255), 3)

        # ============ TRACK XE MÁY ============
        track_kwargs = {
            "persist": True, "conf": MOTO_TRACK_CONF, "imgsz": 640,
            "iou": 0.5, "tracker": "bytetrack.yaml",
            "verbose": False, "device": device,
            "classes": [3],   # motorcycle trong COCO
        }
        moto_results = moto_model.track(frame, **track_kwargs)[0]

        # ============ ĐÈN ĐỎ ============
        tl_results = tl_model.predict(frame, classes=[9], conf=TL_CONF_THRESHOLD,
                                       device=device, verbose=False)[0]
        traffic_light_boxes = (tl_results.boxes.xyxy.cpu().numpy()
                               if tl_results.boxes is not None else [])

        is_red = False
        red_light_violator_ids = []
        boxes = np.array([])
        ids = []

        if moto_results.boxes is not None and len(moto_results.boxes) > 0:
            boxes = moto_results.boxes.xyxy.cpu().numpy()
            ids = (moto_results.boxes.id.int().cpu().numpy()
                   if moto_results.boxes.id is not None
                   else [None] * len(boxes))

            for tl_box in traffic_light_boxes:
                tx1, ty1, tx2, ty2 = map(int, tl_box)
                tl_crop = frame[ty1:ty2, tx1:tx2]
                if red_light_ai.is_light_red(tl_crop):
                    is_red = True
                    break

            for bbox, track_id in zip(boxes, ids):
                if track_id is None:
                    continue
                if red_light_ai.is_crossing_line(bbox, track_id,
                                                  motor_positions_history):
                    if is_red:
                        red_light_violator_ids.append(track_id)

            for box in tl_results.boxes:
                tx1, ty1, tx2, ty2 = map(int, box.xyxy[0].cpu().numpy())
                box_color = (0, 0, 255) if is_red else (0, 255, 0)
                cv2.rectangle(annotated_frame, (tx1, ty1), (tx2, ty2), box_color, 2)

        light_status = "RED LIGHT" if is_red else "GREEN LIGHT"
        light_color = (0, 0, 255) if is_red else (0, 255, 0)
        cv2.putText(annotated_frame, f"TRAFFIC LIGHT: {light_status}",
                    (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, light_color, 3)

        # ============ PRE-COMPUTE LP ↔ BIKE ASSIGNMENT ============
        lp_bike_candidates = []
        for lp_idx, lp in enumerate(lp_dets):
            lx1, ly1, lx2, ly2 = lp["bbox"]
            lp_cx = (lx1 + lx2) / 2.0
            lp_cy = (ly1 + ly2) / 2.0

            for box, bike_id in zip(boxes, ids):
                if bike_id is None:
                    continue
                bx1, by1, bx2, by2 = box
                if not (bx1 - 35 <= lx1 and lx2 <= bx2 + 35
                        and by1 - 50 <= ly1 and ly2 <= by2 + 50):
                    continue
                bike_cx = (bx1 + bx2) / 2.0
                bike_cy = (by1 + by2) / 2.0
                dist = ((lp_cx - bike_cx) ** 2 + (lp_cy - bike_cy) ** 2) ** 0.5
                lp_bike_candidates.append((dist, int(bike_id), lp_idx, lp))

        lp_bike_candidates.sort(key=lambda x: x[0])
        lp_assignments = {}
        used_lp_indices = set()

        for dist, bike_id, lp_idx, lp in lp_bike_candidates:
            if bike_id in lp_assignments or lp_idx in used_lp_indices:
                continue
            lp_assignments[bike_id] = (lp_idx, lp)
            used_lp_indices.add(lp_idx)

        # ============ XỬ LÝ TỪNG XE ============
        if len(boxes) == 0:
            continue

        for box, bike_id in zip(boxes, ids):
            if bike_id is None:
                continue
            bike_id = int(bike_id)

            bike_last_seen[bike_id] = frame_count
            bx1, by1, bx2, by2 = map(int, box)
            cv2.rectangle(annotated_frame, (bx1, by1), (bx2, by2),
                          (255, 165, 0), 2)

            expanded_y1 = max(0, by1 - int((by2 - by1) * 1.0))
            head_max_y = by1 + int((by2 - by1) * 0.70)

            # ---- Cập nhật biển số từ LP assigned ----
            if bike_id in lp_assignments:
                _, lp = lp_assignments[bike_id]
                lx1, ly1, lx2, ly2 = lp["bbox"]

                lp_pad = 10
                crop_x1 = max(0, lx1 - lp_pad)
                crop_y1 = max(0, ly1 - lp_pad)
                crop_x2 = min(w_frame, lx2 + lp_pad)
                crop_y2 = min(h_frame, ly2 + lp_pad)

                if (crop_x2 - crop_x1) >= 20 and (crop_y2 - crop_y1) >= 14:
                    lp_crop = frame[crop_y1:crop_y2, crop_x1:crop_x2]
                    if lp_crop.size > 0:
                        bike_lp_crops[bike_id] = lp_crop

                        current_lp_str = bike_plates.get(bike_id, "")
                        has_solid_plate = bool(
                            current_lp_str
                            and len(current_lp_str.replace("-", "")
                                    .replace(" ", "").replace(".", "")) >= 8
                        )

                        if not has_solid_plate:
                            new_str, _ = read_plate_from_crop(
                                ocr_model, lp_crop,
                                bike_id=bike_id, context="track"
                            )
                            if new_str and len(new_str.replace("-", "")) >= 7:
                                bike_plates[bike_id] = new_str
                                logger.info(f"[LP Track] ID={bike_id} "
                                            f"cập nhật biển: {new_str}")

                                retroactive_update_violation(
                                    bike_id=bike_id,
                                    new_plate=new_str,
                                    lp_crop=lp_crop,
                                    frame=frame,
                                    bike_box=(bx1, by1, bx2, by2),
                                    bike_recorded_violations=bike_recorded_violations,
                                    recorded_plate_violations=recorded_plate_violations,
                                    OUTPUT_DIR=OUTPUT_DIR,
                                )

            detected_lp_str = bike_plates.get(bike_id, "")
            if detected_lp_str:
                cv2.putText(annotated_frame, f"BS: {detected_lp_str}",
                            (bx1, min(h_frame - 10, by2 + 25)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)

            # ---- Kiểm tra no-helmet ----
            has_no_helmet = False
            no_helmet_conf = 0.0
            for nh in no_helmet_dets:
                hx1, hy1, hx2, hy2 = nh["bbox"]
                if (bx1 - 40 <= hx1 and hx2 <= bx2 + 40
                        and expanded_y1 <= hy1 and hy2 <= head_max_y):
                    has_no_helmet = True
                    no_helmet_conf = nh["conf"]
                    break

            is_near_threshold = (by2 >= threshold_y - 40)
            clean_lp = (detected_lp_str.replace(" ", "").replace("-", "")
                        if detected_lp_str else "")
            has_valid_lp = len(clean_lp) >= 7
            has_red_light_violation = (bike_id in red_light_violator_ids)

            if bike_id not in bike_recorded_violations:
                bike_recorded_violations[bike_id] = {'NO_HELMET': -1,
                                                     'RED_LIGHT': -1}

            current_violations = []
            if has_no_helmet:
                current_violations.append("NO_HELMET")
            if has_red_light_violation:
                current_violations.append("RED_LIGHT")

            # ---- Ghi nhận vi phạm ----
            for v_type in current_violations:
                if not (is_near_threshold or has_valid_lp):
                    continue
                if has_valid_lp and (clean_lp, v_type) in recorded_plate_violations:
                    continue

                prev_lp_len = bike_recorded_violations[bike_id][v_type]
                should_save = (prev_lp_len == -1
                               or (prev_lp_len == 0 and has_valid_lp))
                is_update_from_unknown = (prev_lp_len == 0 and has_valid_lp)

                if not should_save:
                    continue

                # ---- GLOBAL DEDUP: bỏ vi phạm trùng biển + loại ----
                if (prev_lp_len == -1 and has_valid_lp
                        and (clean_lp, v_type) in global_recorded_plates):
                    logger.warning(
                        f"[Dedup] Bỏ qua vi phạm trùng: ID={bike_id} "
                        f"Biển={clean_lp} Loại={v_type} "
                        f"(đã ghi bởi xe khác)"
                    )
                    bike_recorded_violations[bike_id][v_type] = len(clean_lp)
                    continue

                # Thử đọc lại LP nếu chưa có
                lp_crop_img = bike_lp_crops.get(bike_id, None)
                if not has_valid_lp:
                    if lp_crop_img is not None and lp_crop_img.size > 0:
                        new_str, _ = read_plate_from_crop(
                            ocr_model, lp_crop_img,
                            bike_id=bike_id, context="save_lp_crop"
                        )
                    else:
                        tail_y1 = max(0, by1 + int((by2 - by1) * 0.55))
                        tail_crop = frame[tail_y1:by2,
                                          max(0, bx1):min(w_frame, bx2)]
                        if tail_crop.size > 0:
                            new_str, _ = read_plate_from_crop(
                                ocr_model, tail_crop,
                                bike_id=bike_id, context="save_tail"
                            )
                            lp_crop_img = tail_crop
                        else:
                            new_str = ""

                    if new_str and len(new_str.replace("-", "")) >= 7:
                        detected_lp_str = new_str
                        bike_plates[bike_id] = new_str
                        clean_lp = detected_lp_str.replace(" ", "").replace("-", "")
                        has_valid_lp = len(clean_lp) >= 7

                if has_valid_lp and (clean_lp, v_type) in recorded_plate_violations \
                        and not is_update_from_unknown:
                    continue

                if prev_lp_len == -1:
                    violation_count += 1

                bike_recorded_violations[bike_id][v_type] = (
                    len(clean_lp) if has_valid_lp else 0
                )
                if has_valid_lp:
                    recorded_plate_violations.add((clean_lp, v_type))
                    global_recorded_plates.add((clean_lp, v_type))

                # ---- Lưu ảnh bằng chứng ----
                crop_pad = 40
                crop_y1 = max(0, expanded_y1 - crop_pad)
                crop_y2 = min(h_frame, by2 + crop_pad)
                crop_x1 = max(0, bx1 - crop_pad)
                crop_x2 = min(w_frame, bx2 + crop_pad)

                evidence_img = frame[crop_y1:crop_y2, crop_x1:crop_x2]
                lp_clean_file = clean_lp if has_valid_lp else "CHUA_RO_BS"

                if is_update_from_unknown:
                    for old_suffix in ["", "_LP_"]:
                        old_path = os.path.join(
                            OUTPUT_DIR,
                            f"violation_ID{bike_id}_{v_type}{old_suffix}CHUA_RO_BS.jpg"
                        )
                        if os.path.exists(old_path):
                            os.remove(old_path)

                evidence_path = os.path.join(
                    OUTPUT_DIR,
                    f"violation_ID{bike_id}_{v_type}_{lp_clean_file}.jpg"
                )
                lp_evidence_path = os.path.join(
                    OUTPUT_DIR,
                    f"violation_ID{bike_id}_{v_type}_LP_{lp_clean_file}.jpg"
                )

                if evidence_img.size > 0:
                    cv2.imwrite(evidence_path, evidence_img)

                if lp_crop_img is not None and lp_crop_img.size > 0:
                    cv2.imwrite(lp_evidence_path, lp_crop_img)
                else:
                    tail_y1 = max(0, by1 + int((by2 - by1) * 0.55))
                    fallback_lp = frame[tail_y1:by2,
                                        max(0, bx1):min(w_frame, bx2)]
                    if fallback_lp.size > 0:
                        cv2.imwrite(lp_evidence_path, fallback_lp)
                    else:
                        lp_evidence_path = None

                # ---- Log ----
                now_str = datetime.now().isoformat()
                violation_name_vn = ("VƯỢT ĐÈN ĐỎ" if v_type == "RED_LIGHT"
                                     else "KHÔNG ĐỘI MŨ BẢO HIỂM")
                tag = ("CẬP NHẬT BIỂN SỐ RÕ NÉT" if is_update_from_unknown
                       else "PHÁT HIỆN VI PHẠM GIAO THÔNG")

                logger.info("=" * 65)
                logger.info(f"🚨 {tag} #{violation_count} (Xe ID: {bike_id})")
                logger.info(f"-> Biển số xe   : "
                            f"{detected_lp_str if detected_lp_str else 'CHƯA RÕ BIỂN SỐ'}")
                logger.info(f"-> Lỗi vi phạm  : {violation_name_vn}")
                logger.info(f"-> Thời gian    : {now_str}")
                logger.info(f"-> Bằng chứng xe: {evidence_path}")
                if lp_evidence_path and os.path.exists(lp_evidence_path):
                    logger.info(f"-> Ảnh biển số  : {lp_evidence_path}")
                logger.info("=" * 65)

                # ---- Gửi API (async) ----
                light_val = "red" if v_type == "RED_LIGHT" else None
                conf_val = no_helmet_conf if v_type == "NO_HELMET" else 0.95

                threading.Thread(
                    target=send_violation,
                    args=(bike_id, detected_lp_str, v_type,
                          conf_val, now_str, evidence_path),
                    kwargs={"light_status": light_val,
                            "plate_image_path": lp_evidence_path},
                    daemon=True,
                ).start()

        # ---- Dọn dẹp track đã mất ----
        expired_ids = [bid for bid, last_frame in bike_last_seen.items()
                       if frame_count - last_frame > TRACK_TIMEOUT_FRAMES]
        for bid in expired_ids:
            bike_plates.pop(bid, None)
            bike_lp_crops.pop(bid, None)
            bike_recorded_violations.pop(bid, None)
            motor_positions_history.pop(bid, None)
            bike_last_seen.pop(bid, None)

    cap.release()
    logger.info(f"[HOÀN THÀNH] Tổng số vi phạm bắt được: {violation_count}")


if __name__ == "__main__":
    video_source = os.getenv("VIDEO_PATH", "0")
    run_traffic_system(video_source)