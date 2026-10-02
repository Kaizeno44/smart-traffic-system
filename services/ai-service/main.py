import os
os.environ["FLAGS_use_mkldnn"] = "0"
import re
import cv2
import numpy as np
import logging
import threading
from datetime import datetime
from ultralytics import YOLO
import torch
from collections import Counter

from core.ocr import LicensePlateOCR
from core.red_light_logic import RedLightDetector
from publisher import send_violation, send_violation_video_update
from core.detection import analyze_frame
from core.tracking import VehicleTracker
from core.rules import is_violation, build_violation_payload
from core.video_recorder import VideoRecorder

# ================== LOGGING SETUP ==================
import sys
import time
import glob
import json
import subprocess


def setup_logger(name: str, level=logging.INFO) -> logging.Logger:
    """Tạo logger riêng có handler stdout, không bị thư viện ngoài ghi đè."""
    lg = logging.getLogger(name)
    lg.handlers.clear()
    lg.setLevel(level)
    lg.propagate = False

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)
    handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    ))
    lg.addHandler(handler)
    return lg


logger = setup_logger("traffic")
setup_logger("publisher")

logging.getLogger("ultralytics").setLevel(logging.WARNING)
logging.getLogger("paddleocr").setLevel(logging.WARNING)
logging.getLogger("ppocr").setLevel(logging.ERROR)
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("PIL").setLevel(logging.WARNING)

# ✅ Flag cancel
CANCEL_FLAGS = set()   # Set các filename cần cancel


# ================== CẤU HÌNH ==================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")
OUTPUT_DIR = os.path.join(BASE_DIR, "output_violations")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Ngưỡng phát hiện
LP_CONF_THRESHOLD = 0.50
HELMET_CONF_THRESHOLD = 0.35
NO_HELMET_CONF_THRESHOLD = 0.45
TL_CONF_THRESHOLD = 0.3
MOTO_TRACK_CONF = 0.85

# Filter hình dạng biển số
LP_MIN_AREA = 800
LP_MIN_WIDTH = 25
LP_MIN_HEIGHT = 12
LP_RATIO_MIN = 1.0
LP_RATIO_MAX = 6.0

TRACK_TIMEOUT_FRAMES = 60

# CẤU HÌNH OVERLOAD (chở quá số người)
# Luật VN: xe máy tối đa 2 người (lái + 1). > 2 = OVERLOAD.
PERSON_CLASS_ID = 0                    # COCO class 0 = person
PERSON_CONF_THRESHOLD = 0.40
MAX_PERSONS_PER_BIKE = 2
OVERLOAD_MIN_OVERLAP_RATIO = 0.25
PERSON_NMS_IOU = 0.65

# Xác nhận theo thời gian (pipeline skip frame lẻ → 3 hit ≈ 6 frame video)
NO_HELMET_MIN_HITS = 3
OVERLOAD_MIN_HITS = 3

HELMET_CLASS_NAMES = {
    "helmet", "with_helmet", "with-helmet", "helmeted",
    "co_mu", "comu", "mu_bao_hiem",
}
NO_HELMET_CLASS_NAMES = {
    "no helmet", "no_helmet", "without_helmet", "without-helmet",
    "no-helmet", "not_helmeted", "khong_mu", "bare_head",
}

# Class names biển số
LP_CLASS_NAMES = {"lp", "license_plate", "license-plate", "plate",
                  "bienso", "bien_so"}

# Regex biển VN chuẩn
PLATE_REGEX = re.compile(r'^(\d{2})([A-Z]{1,2}\d?)(\d{4,5})$')

# Map tên vi phạm tiếng Việt có dấu
VIOLATION_NAME_MAP = {
    "RED_LIGHT": "VƯỢT ĐÈN ĐỎ",
    "NO_HELMET": "KHÔNG ĐỘI MŨ BẢO HIỂM",
    "OVERLOAD": "CHỞ QUÁ SỐ NGƯỜI",
}

# ================== MỨC PHẠT THEO NGHỊ ĐỊNH 168/2024/NĐ-CP ==================
# Căn cứ pháp lý: Nghị định 168/2024/NĐ-CP ngày 26/12/2024
# Hiệu lực: từ 01/01/2025 (Điều 53)
# Áp dụng cho: XE MÔ TÔ, XE GẮN MÁY (Điều 7)
#
# ⚠️ Lưu ý: Mức phạt có thể thay đổi theo quy định mới. Kiểm tra lại trước khi
#           dùng chính thức trong môi trường sản xuất.
VIOLATION_FINE_MAP = {
    "RED_LIGHT": {
        "min": 4_000_000,
        "max": 6_000_000,
        "legal_basis": "Điểm c khoản 7 Điều 7 Nghị định 168/2024/NĐ-CP",
    },
    "NO_HELMET": {
        "min": 400_000,
        "max": 600_000,
        "legal_basis": "Điểm h khoản 2 Điều 7 Nghị định 168/2024/NĐ-CP",
    },
    "OVERLOAD": {
        "min": 600_000,
        "max": 800_000,
        "legal_basis": "Điểm b khoản 3 Điều 7 Nghị định 168/2024/NĐ-CP",
    },
    "PHONE_USE": {
        "min": 800_000,
        "max": 1_000_000,
        "legal_basis": "Chưa có quy định riêng cho xe máy trong Nghị định 168/2024/NĐ-CP",
    },
    "WRONG_LANE": {
        "min": 400_000,
        "max": 600_000,
        "legal_basis": "Điểm d khoản 3 Điều 7 Nghị định 168/2024/NĐ-CP",
    },
    "WRONG_WAY": {
        "min": 4_000_000,
        "max": 6_000_000,
        "legal_basis": "Điểm a khoản 7 Điều 7 Nghị định 168/2024/NĐ-CP",
    },
    "WHEELIE": {
        "min": 6_000_000,
        "max": 8_000_000,
        "legal_basis": "Khoản 8 Điều 7 Nghị định 168/2024/NĐ-CP",
    },
    "ZIGZAG": {
        "min": 8_000_000,
        "max": 10_000_000,
        "legal_basis": "Điểm a khoản 9 Điều 7 Nghị định 168/2024/NĐ-CP",
    },
}


def get_fine_for_violation(v_type: str) -> dict:
    """Trả về thông tin mức phạt cho 1 loại vi phạm."""
    return VIOLATION_FINE_MAP.get(v_type, {
        "min": 0,
        "max": 0,
        "legal_basis": "Chưa có quy định",
    })


def format_vnd(amount: int) -> str:
    """Format số tiền VN: 4000000 → '4.000.000đ'."""
    if amount <= 0:
        return "0đ"
    return f"{amount:,}".replace(",", ".") + "đ"


def format_fine_text(v_type: str) -> str:
    """Format chuỗi mức phạt để log/FE: '400.000đ - 600.000đ'."""
    fine = get_fine_for_violation(v_type)
    if fine["max"] == 0:
        return "Chưa xác định"
    if fine["min"] == fine["max"]:
        return format_vnd(fine["min"])
    return f"{format_vnd(fine['min'])} - {format_vnd(fine['max'])}"


def format_fine_short(v_type: str) -> str:
    """Format ngắn gọn cho log: '400K - 600K'."""
    fine = get_fine_for_violation(v_type)
    if fine["max"] == 0:
        return "N/A"
    min_k = fine["min"] // 1000
    max_k = fine["max"] // 1000
    if min_k == max_k:
        return f"{min_k}K"
    return f"{min_k}K - {max_k}K"


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


def is_valid_plate_box(x1, y1, x2, y2, w_frame=None, h_frame=None):
    """Lọc bbox theo hình dạng — bỏ bánh xe, ống pô, gương và các box chạm mép viền camera."""
    w, h = x2 - x1, y2 - y1
    if w < LP_MIN_WIDTH or h < LP_MIN_HEIGHT:
        return False
    if w * h < LP_MIN_AREA:
        return False
    ratio = w / float(h + 1e-5)
    if not (LP_RATIO_MIN <= ratio <= LP_RATIO_MAX):
        return False
    # ✅ BỎ QUA BIỂN SỐ CHẠM VIỀN MÀN HÌNH (tránh chụp lúc biển mới ló ra hoặc sắp ra khỏi khung hình)
    if w_frame is not None and h_frame is not None:
        margin = 10
        if x1 <= margin or y1 <= margin or x2 >= w_frame - margin or y2 >= h_frame - margin:
            return False
    return True

def has_skin_tone_pixels(crop, threshold=0.08):
    """Kiểm tra vùng ảnh có pixel màu da người (HSV siết lại để tránh nhầm mũ)."""
    if crop is None or crop.size == 0:
        return False
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    h_ch, s_ch, v_ch = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    total = crop.shape[0] * crop.shape[1]

    skin_mask_1 = (
        (h_ch >= 0) & (h_ch <= 25) &
        (s_ch >= 30) & (s_ch <= 170) &
        (v_ch >= 60) & (v_ch <= 255)
    )
    skin_mask_2 = (
        (h_ch >= 160) & (h_ch <= 180) &
        (s_ch >= 30) & (s_ch <= 170) &
        (v_ch >= 60) & (v_ch <= 255)
    )
    skin_pixels = np.sum(skin_mask_1 | skin_mask_2)
    skin_ratio = skin_pixels / float(total + 1e-5)
    return skin_ratio >= threshold

def region_has_helmet_color(frame, box, h_frame, w_frame, ratio=0.10):
    """Nhìn CẢ vùng trên đầu (mũ đỏ nằm trên tóc khi quay sau)."""
    x1, y1, x2, y2 = map(int, box)
    bh, bw = max(y2 - y1, 1), max(x2 - x1, 1)
    ry1 = max(0, y1 - int(bh * 1.6))
    ry2 = min(h_frame, y1 + int(bh * 0.45))
    rx1 = max(0, x1 - int(bw * 0.25))
    rx2 = min(w_frame, x2 + int(bw * 0.25))
    crop = frame[ry1:ry2, rx1:rx2]
    if crop is None or crop.size == 0:
        return False
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    H, S, V = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    total = float(crop.shape[0] * crop.shape[1] + 1e-5)
    red    = ((H <= 18) | (H >= 160)) & (S >= 25) & (V >= 30)
    yellow = (H >= 8) & (H <= 45) & (S >= 25) & (V >= 40)
    white  = (S <= 80) & (V >= 135)
    green  = (H >= 35) & (H <= 95) & (S >= 25) & (V >= 30)
    blue   = (H >= 85) & (H <= 140) & (S >= 25) & (V >= 30)
    return np.sum(red | yellow | white | green | blue) / total >= ratio


def helmet_covers_head(helmet_box, nh_box):
    hx1, hy1, hx2, hy2 = helmet_box
    nx1, ny1, nx2, ny2 = nh_box
    hcx, ncx = (hx1 + hx2) / 2.0, (nx1 + nx2) / 2.0
    nw, nh = max(nx2 - nx1, 1.0), max(ny2 - ny1, 1.0)
    hw = max(hx2 - hx1, 1.0)
    if abs(hcx - ncx) > max(nw, hw) * 0.95:
        return False
    hcy, ncy = (hy1 + hy2) / 2.0, (ny1 + ny2) / 2.0
    if hcy > ncy + nh * 0.4:
        return False
    return (ny1 - hy2) <= nh * 2.0

def parse_and_normalize_plate(raw_text):
    """
    Chuẩn hoá biển số VN — ưu tiên series chữ + tail dài (biển mới VN)
    để tránh regex greedy cướp số 0 của tail vào series.
    """
    if not raw_text:
        return ""

    clean = "".join(c for c in raw_text.upper() if c.isalnum())
    if not (7 <= len(clean) <= 9):
        return ""

    # Thử các cấu trúc ưu tiên: tail 5 số TRƯỚC, tail 4 số SAU
    # (n_letters, has_digit, tail_len)
    combos = [
        (2, 0, 5),   # AB-12345   ← ưu tiên nhất
        (1, 0, 5),   # A-12345
        (1, 1, 5),   # A1-12345   (VD: 47B3-01230)
        (2, 1, 4),   # AB1-2345
        (1, 1, 4),   # A1-2345
        (2, 0, 4),   # AB-1234    (biển cũ)
        (1, 0, 4),   # A-1234
    ]

    for n_letters, has_digit, tail_len in combos:
        idx = 2 + n_letters + has_digit
        if idx + tail_len != len(clean):
            continue

        city = clean[:2]
        series = clean[2:idx]
        tail = clean[idx:]

        # Validate
        if not city.isdigit():
            continue
        if not tail.isdigit():
            continue

        if has_digit:
            # series = n_letters chữ + 1 số cuối
            if not (series[-1].isdigit()
                    and all(c.isalpha() for c in series[:-1])):
                continue
        else:
            if not all(c.isalpha() for c in series):
                continue

        return f"{city}{series}-{tail}"

    return ""


def read_plate_from_crop(ocr_model, crop, bike_id=None, context="det"):
    """Đọc biển từ crop, log rõ, trả về (text_format, conf)."""
    if crop is None or crop.size == 0:
        return "", 0.0

    raw_str, conf = ocr_model.read_plate(crop)
    if not raw_str:
        return "", 0.0

    # Nếu raw_str đã có định dạng hợp lệ dạng XXYY-ZZZZZ (ví dụ 81AR-01082) thì giữ nguyên!
    if "-" in raw_str and len(raw_str) >= 8:
        formatted = raw_str
    else:
        formatted = parse_and_normalize_plate(raw_str)
    if bike_id is not None:
        status = f"✅ {formatted}" if formatted else "❌ BỎ (format sai)"
        logger.info(f"[OCR {context}] ID={bike_id} raw='{raw_str}' "
                    f"conf={conf:.2f} → {status}")
    return formatted, conf


def nms_boxes(boxes, iou_thresh=0.40):
    """Gộp bbox chồng lên nhau — YOLO person hay bắn 2-3 box cho cùng 1 người."""
    if boxes is None:
        return []
    arr = np.asarray(boxes)
    if arr.size == 0:
        return []
    boxes_list = [tuple(map(float, b[:4])) for b in arr]
    boxes_list.sort(key=lambda b: (b[2] - b[0]) * (b[3] - b[1]), reverse=True)
    keep = []
    for box in boxes_list:
        if any(compute_iou(box, k) >= iou_thresh for k in keep):
            continue
        keep.append(box)
    return keep


def boxes_same_head(box_a, box_b):
    """True nếu 2 bbox cùng một đầu (mũ nằm trên, mặt nằm dưới → IoU thấp)."""
    if compute_iou(box_a, box_b) >= 0.15:
        return True

    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b
    acx = (ax1 + ax2) / 2.0
    bcx = (bx1 + bx2) / 2.0
    acy = (ay1 + ay2) / 2.0
    bcy = (by1 + by2) / 2.0
    aw, ah = max(ax2 - ax1, 1.0), max(ay2 - ay1, 1.0)
    bw, bh = max(bx2 - bx1, 1.0), max(by2 - by1, 1.0)
    avg_w = (aw + bw) / 2.0
    avg_h = (ah + bh) / 2.0

    if abs(acx - bcx) > avg_w * 0.75:
        return False

    vert_gap = 0.0
    if ay2 < by1:
        vert_gap = by1 - ay2
    elif by2 < ay1:
        vert_gap = ay1 - by2
    return vert_gap <= avg_h * 0.55 and abs(acy - bcy) <= avg_h * 1.35


def is_in_head_zone(det_bbox, bike_box, x_margin_ratio=0.22, up_ratio=1.35, down_ratio=0.50):
    """Tâm detection có nằm vùng đầu người lái (phía trên bbox xe) không."""
    hx1, hy1, hx2, hy2 = det_bbox
    bx1, by1, bx2, by2 = bike_box
    bw = bx2 - bx1
    bh = by2 - by1
    hcx = (hx1 + hx2) / 2.0
    hcy = (hy1 + hy2) / 2.0
    x_pad = bw * x_margin_ratio
    return (
        (bx1 - x_pad) <= hcx <= (bx2 + x_pad)
        and (by1 - bh * up_ratio) <= hcy <= (by1 + bh * down_ratio)
    )

def detect_heads_on_bike_crop(helmet_model, frame, bike_box, device):
    """Chạy model mũ trên crop từng xe — video dọc 720x1280 full-frame imgsz=640 hay miss xe thứ 2."""
    h_frame, w_frame = frame.shape[:2]
    bx1, by1, bx2, by2 = map(int, bike_box)
    bw, bh = max(bx2 - bx1, 1), max(by2 - by1, 1)
    x1 = max(0, bx1 - int(bw * 0.30))
    x2 = min(w_frame, bx2 + int(bw * 0.30))
    y1 = max(0, by1 - int(bh * 1.70))
    y2 = min(h_frame, by2 + int(bh * 0.08))
    if (x2 - x1) < 24 or (y2 - y1) < 24:
        return [], []
    crop = frame[y1:y2, x1:x2]
    if crop is None or crop.size == 0:
        return [], []
    dets = analyze_frame(
        helmet_model, crop,
        conf=min(HELMET_CONF_THRESHOLD, 0.25),
        imgsz=640, device=device,
    )
    helmets, no_helmets = [], []
    for d in dets:
        dx1, dy1, dx2, dy2 = d["bbox"]
        mapped = dict(d)
        mapped["bbox"] = (dx1 + x1, dy1 + y1, dx2 + x1, dy2 + y1)
        cls_name = mapped["class_lower"]
        if cls_name in HELMET_CLASS_NAMES:
            helmets.append(mapped)
        elif cls_name in NO_HELMET_CLASS_NAMES:
            no_helmets.append(mapped)
    return helmets, no_helmets

def assign_persons_to_bikes(person_boxes, bike_entries):
    """
    Mỗi người chỉ thuộc 1 xe (greedy theo overlap).
    Trả về dict bike_id -> số người trên xe.
    """
    persons = nms_boxes(person_boxes, iou_thresh=PERSON_NMS_IOU)
    counts = {int(bid): 0 for bid, _ in bike_entries}
    if not persons or not bike_entries:
        return counts

    scores = []
    for pi, pbox in enumerate(persons):
        px1, py1, px2, py2 = pbox
        pcx = (px1 + px2) / 2.0
        pcy = (py1 + py2) / 2.0
        person_area = (px2 - px1) * (py2 - py1)
        if person_area <= 0:
            continue

        for bike_id, bike_box in bike_entries:
            bx1, by1, bx2, by2 = bike_box
            bw = bx2 - bx1
            bh = by2 - by1
            if bw <= 0 or bh <= 0:
                continue

            # Nới bbox xe lên trên để chứa thân/đầu người lái
            ex_y1 = by1 - bh * 0.85
            ex_x1 = bx1 - bw * 0.08
            ex_x2 = bx2 + bw * 0.08

            if not (ex_x1 <= pcx <= ex_x2 and ex_y1 <= pcy <= by2):
                continue

            inter_x1 = max(bx1, px1)
            inter_y1 = max(ex_y1, py1)
            inter_x2 = min(bx2, px2)
            inter_y2 = min(by2, py2)
            if inter_x2 <= inter_x1 or inter_y2 <= inter_y1:
                continue

            inter_area = (inter_x2 - inter_x1) * (inter_y2 - inter_y1)
            overlap_person = inter_area / person_area
            if overlap_person < OVERLOAD_MIN_OVERLAP_RATIO:
                continue

            bike_area = bw * bh
            if person_area > bike_area * 4.0:
                continue
            if person_area < bike_area * 0.08:
                continue

            dist_x = abs(pcx - (bx1 + bx2) / 2.0) / (bw + 1e-5)
            score = overlap_person - 0.20 * dist_x
            scores.append((score, pi, int(bike_id)))

    scores.sort(key=lambda x: x[0], reverse=True)
    used_persons = set()
    for score, pi, bike_id in scores:
        if pi in used_persons:
            continue
        used_persons.add(pi)
        counts[bike_id] = counts.get(bike_id, 0) + 1
    return counts


def count_persons_on_bike(person_boxes, bike_box):
    """Đếm người trên 1 xe — giữ API cũ, dùng NMS + overlap."""
    dummy = assign_persons_to_bikes(person_boxes, [(0, bike_box)])
    return dummy.get(0, 0)


# ================== RETROACTIVE UPDATE ==================

def retroactive_update_violation(bike_id, new_plate, lp_crop, frame, bike_box,
                                 bike_recorded_violations,
                                 recorded_plate_violations,
                                 OUTPUT_DIR,
                                 video_filename=None):
    """
    Cập nhật vi phạm cũ (đã ghi 'CHUA_RO_BS') khi OCR đọc được biển số.
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

        vn_name = VIOLATION_NAME_MAP.get(v_type, v_type)
        logger.info("=" * 65)
        logger.info(f"🔄 CẬP NHẬT BIỂN SỐ VI PHẠM (Xe ID: {bike_id})")
        logger.info(f"-> Biển số xe   : {new_plate}")
        logger.info(f"-> Lỗi vi phạm  : {vn_name}")
        logger.info(f"-> Bằng chứng xe: {evidence_path}")
        logger.info(f"-> Ảnh biển số  : {lp_evidence_path}")
        logger.info("=" * 65)

        light_val = "red" if v_type == "RED_LIGHT" else None
        fine_info = get_fine_for_violation(v_type)
        threading.Thread(
            target=send_violation,
            args=(bike_id, new_plate, v_type, 0.95,
                  datetime.now().isoformat(), evidence_path),
            kwargs={
                "light_status": light_val,
                "plate_image_path": lp_evidence_path,
                "fine_min": fine_info["min"],
                "fine_max": fine_info["max"],
                "fine_text": format_fine_text(v_type),
                "legal_basis": fine_info["legal_basis"],
                "session_id": video_filename or "",
            },
            daemon=True,
        ).start()


# ================== PROGRESS + METADATA ==================
def send_progress(video_filename, frame_current, frame_total, violations_count):
    """Gửi progress lên backend qua HTTP."""
    if not video_filename:
        return
    try:
        import requests
        # Lấy base URL (Ưu tiên Docker BACKEND_BASE_URL, fallback localhost)
        base_url = os.getenv("BACKEND_BASE_URL", "http://localhost:3000")
        percent = round(frame_current / frame_total * 100, 1) if frame_total > 0 else 0
        print(f"  [Progress] {video_filename}: {frame_current}/{frame_total} ({percent}%)", flush=True)

        requests.post(
            f"{base_url}/api/videos/progress",
            json={
                "filename": video_filename,
                "frame_current": frame_current,
                "frame_total": frame_total,
                "violations_count": violations_count,
                "percent": percent,
            },
            timeout=1,
        )
    except Exception as e:
        print(f"  [Progress Error] {e}", flush=True)

def extract_video_metadata(video_path):
    """Extract metadata video bằng ffprobe."""
    try:
        cmd = [
            'ffprobe', '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height,r_frame_rate,duration',
            '-of', 'json',
            video_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        data = json.loads(result.stdout)
        stream = data.get('streams', [{}])[0]
        # Parse FPS từ "30/1" → 30
        fps_raw = stream.get('r_frame_rate', '0/1')
        if '/' in fps_raw:
            num, den = fps_raw.split('/')
            fps = round(int(num) / int(den), 1) if int(den) > 0 else 0
        else:
            fps = float(fps_raw)
        return {
            'width': stream.get('width', 0),
            'height': stream.get('height', 0),
            'fps': fps,
            'duration': round(float(stream.get('duration', 0)), 2),
            'size_mb': round(os.path.getsize(video_path) / 1024 / 1024, 2),
        }
    except Exception as e:
        print(f"  [Metadata] Lỗi extract: {e}")
        return {}


# ================== PIPELINE CHÍNH ==================

def run_traffic_system(video_path, video_filename=None):
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    logger.info(f"--> Đang chạy AI trên: {device} "
                f"({torch.cuda.get_device_name(0) if device == 'cuda' else 'CPU'})")
    logger.info("[1/3] Đang nạp các mô hình AI...")

    # --- Nạp model ---
    try:
        moto_model = YOLO(os.path.join(MODELS_DIR, "bike.pt")).to(device)
        helmet_model = YOLO(os.path.join(MODELS_DIR, "helmet_lp_best.pt")).to(device)
        lp_model = YOLO(os.path.join(MODELS_DIR, "my_lp_model.pt")).to(device)
        tl_model = YOLO("yolov8n.pt").to(device)
        person_model = YOLO("yolov8n.pt").to(device)      # detect người
        stop_line_model = YOLO(os.path.join(MODELS_DIR, "stop_line.pt")).to(device) # model vạch dừng
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
    tracker = VehicleTracker(screen_threshold_ratio=0.7)

    # Ép kiểu video source
    if isinstance(video_path, str) and video_path.isdigit():
        video_path = int(video_path)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        logger.error(f"Không thể mở video: '{video_path}'")
        return

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    logger.info(f"[Info] Tổng số frame: {total_frames}")

    violation_count = 0
    logger.info("[3/3] Bắt đầu quét video...")

    # --- State per bike ---
    bike_plates = {}
    bike_lp_crops = {}
    bike_recorded_violations = {}
    bike_plate_votes = {}
    bike_nh_streak = {}
    bike_ol_streak = {}
    bike_nh_history = {}
    bike_last_seen = {}
    recorded_plate_violations = set()
    global_recorded_plates = set()
    red_light_violator_history = set()
    bike_pos_history = {}

    # --- Red-light detector + Stop-line detector ---
    # --- Khởi tạo giá trị vạch dừng mặc định ---
    ret_test, frame_test = cap.read()
    if not ret_test:
        logger.error("Không đọc được frame đầu tiên từ video.")
        cap.release()
        return

    h_f, w_f, _ = frame_test.shape
    
    # Biến lưu trữ tọa độ Y của vạch (khởi tạo ở mức 70% màn hình để dự phòng)
    h_f, w_f, _ = frame_test.shape
    
    # Dùng vạch ảo nằm ngoài màn hình (y = -100) để thư viện không bị lỗi NoneType
    current_stop_y = -100
    red_light_ai = RedLightDetector(stop_line_coords=[(0, -100), (w_f, -100)])
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

    # ✅ BIẾN QUẢN LÝ VẠCH DỪNG CHU KỲ 5 GIÂY
    stable_stop_y = -100
    stable_stop_conf = 0.0
    stable_sl_box = None
    stop_y_buffer = []
    stop_conf_buffer = []
    stop_box_buffer = []
    sampling_stop_line = True  # Bắt đầu video sẽ bật chế độ lấy mẫu ngay
    frames_since_last_update = 0
    # Video đang skip frame chẵn lẻ (còn ~15 fps), nên 5 giây = 75 frames xử lý
    UPDATE_INTERVAL_FRAMES = 30 
    SAMPLE_TARGET = 5 # Lấy 5 frame có vạch để chốt

    motor_positions_history = {}
    frame_count = 0

    # ✅ Khởi tạo Video Recorder
    VIDEO_DIR = os.path.join(OUTPUT_DIR, "videos")
    os.makedirs(VIDEO_DIR, exist_ok=True)
    video_recorder = VideoRecorder(
        output_dir=VIDEO_DIR,
        fps=30,
        pre_seconds=3,
        post_seconds=2,
    )
    logger.info(f"[Recorder] Video clips sẽ lưu tại: {VIDEO_DIR}")

    # ================== MAIN LOOP ==================
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            logger.info("Video đã kết thúc hoặc mất kết nối camera.")
            break
        frame_count += 1

        if frame_count % 1 != 0:
            continue

        # ✅ Gửi progress + check cancel mỗi 100 frame
        if frame_count % 100 == 0:
            send_progress(video_filename, frame_count, total_frames, violation_count)
            # Check cancel flag từ backend
            if video_filename in CANCEL_FLAGS:
                logger.warning(f"⏹️ Video bị CANCEL bởi user: {video_filename}")
                CANCEL_FLAGS.discard(video_filename)
                cap.release()
                return

        # ✅ Update buffer recorder mỗi frame
        video_recorder.add_frame(frame)

        finished_clips = video_recorder.update()
        for bike_id_clip, video_path in finished_clips:
            try:
                threading.Thread(
                    target=send_violation_video_update,
                    args=(bike_id_clip, video_path),
                    daemon=True,
                ).start()
            except Exception as e:
                logger.error(f"[Recorder] Lỗi gửi video update: {e}")

        annotated_frame = frame.copy()
        h_frame, w_frame, _ = frame.shape

        # ============ DETECT STOP LINE ĐỘNG THEO CHU KỲ (5 GIÂY / 1 LẦN) ============
        frames_since_last_update += 1

        # Kích hoạt lại việc lấy mẫu sau mỗi 5 giây
        if not sampling_stop_line and frames_since_last_update >= UPDATE_INTERVAL_FRAMES:
            sampling_stop_line = True
            stop_y_buffer = []
            stop_conf_buffer = []
            stop_box_buffer = []    # <--- Reset buffer khung
            frames_since_last_update = 0

        # CHỈ gọi AI YOLO quét vạch khi đang trong thời gian lấy mẫu
        if sampling_stop_line:
            sl_results = stop_line_model.predict(
                frame, classes=[1], conf=0.41, device=device, verbose=False
            )[0]
            
            if sl_results.boxes is not None and len(sl_results.boxes) > 0:
                sl_box = sl_results.boxes.xyxy[0].cpu().numpy()
                found_y = int((sl_box[1] + sl_box[3]) / 2)
                found_conf = float(sl_results.boxes.conf[0].cpu().numpy())
                
                stop_y_buffer.append(found_y)
                stop_conf_buffer.append(found_conf)
                stop_box_buffer.append(sl_box)  # <--- Lưu khung vào buffer
                
                # ✅ VẼ NGAY KHUNG AI ĐANG NHÌN THẤY REALTIME (Màu Hồng)
                sx1, sy1, sx2, sy2 = map(int, sl_box)
                cv2.rectangle(annotated_frame, (sx1, sy1), (sx2, sy2), (255, 0, 255), 2)
                cv2.putText(annotated_frame, f"AI-Box: {found_conf:.2f}", (sx1, sy1 - 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 0, 255), 2)
            
            # Đóng chốt vạch nếu đã thu thập đủ 5 mẫu, hoặc bị quá giờ
            if len(stop_y_buffer) >= SAMPLE_TARGET or frames_since_last_update > 20:
                if len(stop_y_buffer) > 0:
                    stable_stop_y = int(np.median(stop_y_buffer))
                    stable_stop_conf = float(np.median(stop_conf_buffer))
                    stable_sl_box = stop_box_buffer[-1]  # <--- Lấy khung cuối cùng làm chuẩn
                    logger.info(f"[StopLine] Đã chốt vạch mới tại Y={stable_stop_y} (conf: {stable_stop_conf:.2f})")
                
                sampling_stop_line = False
                frames_since_last_update = 0

        # Cập nhật vạch kiểm tra thực tế
        current_stop_y = stable_stop_y
        
        if current_stop_y > 0:
            stop_line_coords = [(0, current_stop_y), (w_frame, current_stop_y)]
            red_light_ai.stop_line_coords = stop_line_coords
            
            # Vẽ đường kẻ ngang cắt toàn màn hình
            line_color = (0, 165, 255) if sampling_stop_line else (0, 0, 255)
            cv2.line(annotated_frame, (0, current_stop_y), (w_frame, current_stop_y), line_color, 3)
            status_text = " (Updating...)" if sampling_stop_line else f" (Conf: {stable_stop_conf:.2f})"
            cv2.putText(annotated_frame, "Vach Kiem Tra AI" + status_text,
                        (20, current_stop_y - 15), cv2.FONT_HERSHEY_SIMPLEX,
                        1.0, line_color, 3)
                        
            # ✅ VẼ CỐ ĐỊNH KHUNG MÀ AI ĐÃ CHỐT KHI ĐANG "NGỦ" (Màu Cam)
            if not sampling_stop_line and stable_sl_box is not None:
                sx1, sy1, sx2, sy2 = map(int, stable_sl_box)
                cv2.rectangle(annotated_frame, (sx1, sy1), (sx2, sy2), (0, 165, 255), 2) 
                cv2.putText(annotated_frame, f"Stop-Line: {stable_stop_conf:.2f}", (sx1, sy1 - 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 165, 255), 2)
        else:
            red_light_ai.stop_line_coords = [(0, -100), (w_frame, -100)]

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

            if cls_name in HELMET_CLASS_NAMES:
                helmet_dets.append(det)
                cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 255, 0), 3)
            elif cls_name in NO_HELMET_CLASS_NAMES:
                raw_no_helmet_dets.append(det)
            elif cls_name in LP_CLASS_NAMES:
                if is_valid_plate_box(x1, y1, x2, y2, w_frame, h_frame):
                    det["_source"] = "helmet_lp"
                    lp_dets.append(det)

        # --- Từ my_lp_model.pt (dedupe IoU > 0.5) ---
        for det in lp_detections_aux:
            x1, y1, x2, y2 = det["bbox"]
            if not is_valid_plate_box(x1, y1, x2, y2, w_frame, h_frame):
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

            if conf < NO_HELMET_CONF_THRESHOLD:
                continue
            if not (0.5 <= aspect <= 2.4):
                continue

            # Cùng một đầu đã có mũ → không phải no-helmet
            if any(
                boxes_same_head(nh["bbox"], h["bbox"])
                or helmet_covers_head(h["bbox"], nh["bbox"])
                for h in helmet_dets
            ):
                continue

            # Da mặt (lọc gương, đèn, mũ màu bị nhầm class)
            face_y1 = y1 + int((y2 - y1) * 0.40)
            head_crop = frame[max(0, face_y1):min(h_frame, y2),
                              max(0, x1):min(w_frame, x2)]
            if not has_skin_tone_pixels(head_crop, threshold=0.05):
                if conf < 0.50:
                    continue

            # Mũ vàng/trắng/đỏ (như 77N9-1266) hay bị class nhầm no_helmet
            pad_up = int((y2 - y1) * 0.90)
            full_head = frame[max(0, y1 - pad_up):min(h_frame, y2),
                              max(0, x1):min(w_frame, x2)]
            no_helmet_dets.append(nh)
            cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 0, 255), 3)

        # ============ TRACK XE MÁY ============
        track_kwargs = {
            "persist": True, "conf": MOTO_TRACK_CONF, "imgsz": 640,
            "iou": 0.5, "tracker": "bytetrack.yaml",
            "verbose": False, "device": device,
            "classes": [3],   # motorcycle
        }
        moto_results = moto_model.track(frame, **track_kwargs)[0]

        # ============ DETECT NGƯỜI (cho OVERLOAD) ============
        person_results = person_model.predict(
            frame,
            classes=[PERSON_CLASS_ID],
            conf=PERSON_CONF_THRESHOLD,
            device=device,
            verbose=False,
        )[0]

        person_boxes = (
            person_results.boxes.xyxy.cpu().numpy()
            if person_results.boxes is not None
            else np.array([])
        )

        # ============ ĐÈN ĐỎ ============
        tl_results = tl_model.predict(frame, classes=[9], conf=TL_CONF_THRESHOLD,
                                       device=device, verbose=False)[0]
        traffic_light_boxes = (tl_results.boxes.xyxy.cpu().numpy()
                               if tl_results.boxes is not None else [])

        is_red = False
        
        # 1. AI luôn phải quan sát đèn giao thông trước tiên
        for tl_box in traffic_light_boxes:
            tx1, ty1, tx2, ty2 = map(int, tl_box)
            tl_crop = frame[ty1:ty2, tx1:tx2]
            if red_light_ai.is_light_red(tl_crop):
                is_red = True
                break

        # ✅ VẼ VÙNG ĐỎ (RED ZONE) LÊN MÀN HÌNH TRỰC QUAN
        if current_stop_y > 0:
            # Tọa độ bẫy: 150px phía TRÊN vạch, 20px phía DƯỚI vạch (để trừ hao bánh xe)
            trap_y1 = current_stop_y - 150
            trap_y2 = current_stop_y + 20
            
            # Chỉ kích hoạt Vùng Đỏ khi đèn đang ĐỎ
            if is_red:
                # Tạo hiệu ứng nền đỏ bán trong suốt (để không che khuất xe)
                overlay = annotated_frame.copy()
                cv2.rectangle(overlay, (0, trap_y1), (w_frame, trap_y2), (0, 0, 255), -1)
                cv2.addWeighted(overlay, 0.25, annotated_frame, 0.75, 0, annotated_frame)
                
                # Kẻ viền và hiển thị cảnh báo
                cv2.rectangle(annotated_frame, (0, trap_y1), (w_frame, trap_y2), (0, 0, 255), 2)
                cv2.putText(annotated_frame, "VUNG DO (CAM VUOT)", (10, trap_y1 + 25), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
                
        boxes = np.array([])
        ids = []
        confs = []

        # 2. Xử lý xe máy vượt vạch
        if moto_results.boxes is not None and len(moto_results.boxes) > 0:
            boxes = moto_results.boxes.xyxy.cpu().numpy()
            ids = (moto_results.boxes.id.int().cpu().numpy()
                   if moto_results.boxes.id is not None
                   else [None] * len(boxes))
            confs = moto_results.boxes.conf.cpu().numpy()

            for bbox, track_id in zip(boxes, ids):
                if track_id is None:
                    continue
                
                bx1, by1, bx2, by2 = map(int, bbox)
                
                # ✅ 1. Cập nhật lịch sử vị trí (X và Y) để phân tích hướng đi chính xác
                cx = int((bx1 + bx2) / 2) # Tâm X của xe
                hist = bike_pos_history.setdefault(track_id, [])
                hist.append((cx, by2))
                
                if len(hist) > 10:  
                    hist.pop(0)

                # ✅ 2. Bắt vi phạm Vùng Đỏ + Lọc xe tạt ngang
                if current_stop_y > 0 and is_red:
                    if trap_y1 <= by2 <= trap_y2:
                        if len(hist) >= 3:
                            old_x, old_y = hist[0]
                            
                            # Tính quãng đường di chuyển theo X (ngang) và Y (dọc)
                            dx = abs(cx - old_x)
                            dy = old_y - by2  # dy dương = xe đi tiến ra xa camera
                            
                            # ĐIỀU KIỆN CHUẨN KÉP:
                            # 1. dy > 10: Xe phải tiến lên phía trước một đoạn rõ rệt (loại trừ khung AI rung lắc)
                            # 2. dy > dx * 0.8: Quãng đường tiến lên (dọc) phải áp đảo quãng đường tạt ngang
                            if dy > 10 and dy > dx * 0.8:
                                red_light_violator_history.add(track_id)

        # 3. Vẽ khung cho tất cả các đèn giao thông tìm thấy
        if tl_results.boxes is not None:
            for i in range(len(tl_results.boxes)):
                # Lấy tọa độ và conf trực tiếp từ mảng kết quả của YOLO
                tx1, ty1, tx2, ty2 = map(int, tl_results.boxes.xyxy[i].cpu().numpy())
                tl_conf = float(tl_results.boxes.conf[i].cpu().numpy()) # <--- Lấy conf
                
                box_color = (0, 0, 255) if is_red else (0, 255, 0)
                cv2.rectangle(annotated_frame, (tx1, ty1), (tx2, ty2), box_color, 2)
                
                # <--- Vẽ text conf nằm ngay trên hộp đèn giao thông
                cv2.putText(annotated_frame, f"{tl_conf:.2f}", (tx1, max(20, ty1 - 8)), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, box_color, 2)

        # ✅ THÊM LẠI ĐOẠN NÀY ĐỂ HIỂN THỊ CHỮ TRÊN GÓC TRÁI MÀN HÌNH
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

        # ============ GÁN HELMET / NO_HELMET / PERSON CHO TỪNG XE ============
        bike_entries = []
        for box, bike_id in zip(boxes, ids):
            if bike_id is None:
                continue
            bike_entries.append((int(bike_id), tuple(map(float, box[:4]))))

        persons_per_bike = assign_persons_to_bikes(person_boxes, bike_entries)

        bike_helmet_count = {bid: 0 for bid, _ in bike_entries}
        bike_helmet_list = {bid: [] for bid, _ in bike_entries}
        used_helmet_idx = set()
        helmet_cands = []
        for h_idx, h in enumerate(helmet_dets):
            hx1, hy1, hx2, hy2 = h["bbox"]
            hcx = (hx1 + hx2) / 2.0
            for bid, bbox in bike_entries:
                if not is_in_head_zone(h["bbox"], bbox):
                    continue
                bx1, by1, bx2, by2 = bbox
                dist = abs(hcx - (bx1 + bx2) / 2.0) + abs(hy2 - by1)
                helmet_cands.append((dist, bid, h_idx, h))
        helmet_cands.sort(key=lambda x: x[0])
        for dist, bid, h_idx, h in helmet_cands:
            if h_idx in used_helmet_idx:
                continue
            used_helmet_idx.add(h_idx)
            if any(boxes_same_head(h["bbox"], existing["bbox"])
                   for existing in bike_helmet_list.get(bid, [])):
                continue
            bike_helmet_count[bid] = bike_helmet_count.get(bid, 0) + 1
            bike_helmet_list.setdefault(bid, []).append(h)

        no_helmet_assignments = {}
        nh_bike_candidates = []
        for nh_idx, nh in enumerate(no_helmet_dets):
            hx1, hy1, hx2, hy2 = nh["bbox"]
            nh_cx = (hx1 + hx2) / 2.0
            for bid, bbox in bike_entries:
                if not is_in_head_zone(nh["bbox"], bbox):
                    continue
                if any(boxes_same_head(nh["bbox"], h["bbox"])
                       for h in bike_helmet_list.get(bid, [])):
                    continue
                bx1, by1, bx2, by2 = bbox
                dist = abs(nh_cx - (bx1 + bx2) / 2.0) + abs(hy2 - by1)
                nh_bike_candidates.append((dist, bid, nh_idx, nh))

        nh_bike_candidates.sort(key=lambda x: x[0])
        used_nh_indices = set()
        for dist, bid, nh_idx, nh in nh_bike_candidates:
            if bid in no_helmet_assignments or nh_idx in used_nh_indices:
                continue
            no_helmet_assignments[bid] = nh
            used_nh_indices.add(nh_idx)
        for bid, bbox in bike_entries:
            if bid in no_helmet_assignments:
                continue
            crop_helmets, crop_nhs = detect_heads_on_bike_crop(
                helmet_model, frame, bbox, device
            )
            for h in crop_helmets:
                if any(boxes_same_head(h["bbox"], existing["bbox"])
                       for existing in bike_helmet_list.get(bid, [])):
                    continue
                bike_helmet_list.setdefault(bid, []).append(h)
                bike_helmet_count[bid] = bike_helmet_count.get(bid, 0) + 1
            picked = None
            for nh in sorted(crop_nhs, key=lambda d: -d["conf"]):
                if nh["conf"] < NO_HELMET_CONF_THRESHOLD:
                    continue
                # nx1, ny1, nx2, ny2 = map(int, nh["bbox"])
                # pad_up = int((ny2 - ny1) * 0.90)
                # nh_crop = frame[max(0, ny1 - pad_up):min(h_frame, ny2),
                #                 max(0, nx1):min(w_frame, nx2)]
                if any(boxes_same_head(nh["bbox"], h["bbox"])
                       for h in bike_helmet_list.get(bid, [])):
                    continue
                picked = nh
                break
            if bike_helmet_count.get(bid, 0) >= 1:
                picked = None

            if picked is not None:
                same_head_helmet = any(
                    boxes_same_head(
                        picked["bbox"],
                        h["bbox"]
                    )
                    for h in bike_helmet_list.get(bid, [])
                )

                if same_head_helmet:
                    logger.info(
                        f"[NH-crop] ID={bid} "
                        f"no_helmet conf={picked['conf']:.2f} "
                        f"-> bỏ vì cùng đầu đã detect helmet"
                    )
                    picked = None
                else:
                    no_helmet_assignments[bid] = picked
                    logger.info(
                        f"[NH-crop] ID={bid} "
                        f"✅ nhận no-helmet conf={picked['conf']:.2f}"
                    )
        # ============ XỬ LÝ TỪNG XE ============
        if len(boxes) == 0:
            continue

        # ✅ Thêm 'conf' vào vòng lặp zip
        for box, bike_id, conf in zip(boxes, ids, confs):
            if bike_id is None:
                continue
            bike_id = int(bike_id)

            bike_last_seen[bike_id] = frame_count
            bx1, by1, bx2, by2 = map(int, box)
            cv2.rectangle(annotated_frame, (bx1, by1), (bx2, by2),
                          (255, 165, 0), 2)
                          
            # ✅ Vẽ thông số ID và conf ở góc trên bên trong khung xe máy
            cv2.putText(annotated_frame, f"ID:{bike_id} | {conf:.2f}", 
                        (bx1 + 4, by1 + 16), cv2.FONT_HERSHEY_SIMPLEX, 
                        0.55, (255, 165, 0), 2)

            expanded_y1 = max(0, by1 - int((by2 - by1) * 1.5))
            head_max_y = by1 + int((by2 - by1) * 0.70)

            # ---- Cập nhật biển số từ LP assigned ----
            if bike_id in lp_assignments:
                _, lp = lp_assignments[bike_id]
                lx1, ly1, lx2, ly2 = lp["bbox"]

                box_w = lx2 - lx1
                box_h = ly2 - ly1
                # Mở rộng mạnh hơn để tránh bbox LP bị cắt mép
                pad_left   = max(100, int(box_w * 1.00))
                pad_right  = max(80,  int(box_w * 0.80))
                pad_top    = max(50,  int(box_h * 0.70))
                pad_bottom = max(50,  int(box_h * 0.70))

                crop_x1 = max(0, lx1 - pad_left)
                crop_y1 = max(0, ly1 - pad_top)
                crop_x2 = min(w_frame, lx2 + pad_right)
                crop_y2 = min(h_frame, ly2 + pad_bottom)


                if (crop_x2 - crop_x1) >= 20 and (crop_y2 - crop_y1) >= 14:
                    lp_crop = frame[crop_y1:crop_y2, crop_x1:crop_x2]
                    if lp_crop.size > 0:
                        # ✅ Ưu tiên lưu ảnh không bị cấn sát mép biên (crop_x1 > 0)
                        # Hoặc nếu chưa có ảnh nào thì mới nhận
                        is_not_edge_cut = (crop_x1 > 0 and crop_x2 < w_frame)
                        if bike_id not in bike_lp_crops or is_not_edge_cut:
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
                        else:
                            new_str = ""

                        if new_str and len(new_str.replace("-", "")) >= 7:
                            vote = bike_plate_votes.setdefault(bike_id, Counter())
                            vote[new_str] += 1
                            top_plate, top_count = vote.most_common(1)[0]
                            if top_count >= 3:
                                # ✅ KIỂM TRA: biển này đã được gán cho track khác chưa?
                                existing_bike = None
                                for other_id, other_plate in bike_plates.items():
                                    if other_id != bike_id and other_plate == top_plate:
                                        existing_bike = other_id
                                        break

                                if existing_bike is not None:
                                    logger.info(f"[Merge] ID={bike_id} trùng biển '{top_plate}' "
                                                f"với ID={existing_bike} → bỏ qua ID mới")
                                    bike_recorded_violations[bike_id] = \
                                        bike_recorded_violations.get(existing_bike, {
                                            'NO_HELMET': -1, 'RED_LIGHT': -1, 'OVERLOAD': -1,
                                        }).copy()
                                    bike_plates[bike_id] = top_plate
                                else:
                                    bike_plates[bike_id] = top_plate
                                    logger.info(f"[Vote] ID={bike_id} chốt biển '{top_plate}' "
                                                f"({top_count} phiếu / tổng {sum(vote.values())})")
                                    retroactive_update_violation(
                                        bike_id=bike_id,
                                        new_plate=top_plate,
                                        lp_crop=lp_crop,
                                        frame=frame,
                                        bike_box=(bx1, by1, bx2, by2),
                                        bike_recorded_violations=bike_recorded_violations,
                                        recorded_plate_violations=recorded_plate_violations,
                                        OUTPUT_DIR=OUTPUT_DIR,
                                        video_filename=video_filename,
                                    )

            detected_lp_str = bike_plates.get(bike_id, "")
            if detected_lp_str:
                cv2.putText(annotated_frame, f"BS: {detected_lp_str}",
                            (bx1, min(h_frame - 10, by2 + 25)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)

            # ---- Kiểm tra no-helmet + overload (có helmet-veto + streak) ----
            n_helmet = bike_helmet_count.get(bike_id, 0)
            persons_on_bike = persons_per_bike.get(bike_id, 0)

            has_no_helmet = False
            no_helmet_conf = 0.0
            if bike_id in no_helmet_assignments:
                nh = no_helmet_assignments[bike_id]
                # Mũ đỏ/vàng trên đầu xe này → không phạt
                # if region_has_helmet_color(frame, nh["bbox"], h_frame, w_frame):
                #     has_no_helmet = False
                # el
                if any(helmet_covers_head(h["bbox"], nh["bbox"])
                         for h in bike_helmet_list.get(bike_id, [])):
                    has_no_helmet = False
                else:
                    has_no_helmet = True
                    no_helmet_conf = nh["conf"]

            # Đã thấy class helmet trên xe → không phạt (1 người đội mũ)
            if n_helmet >= 1:
                has_no_helmet = False

            if has_no_helmet:
                bike_nh_streak[bike_id] = bike_nh_streak.get(bike_id, 0) + 1
            else:
                bike_nh_streak[bike_id] = 0
                bike_nh_history[bike_id] = []

            hist = bike_nh_history.setdefault(bike_id, [])
            hist.append(1 if has_no_helmet else 0)
            if len(hist) > 6:
                del hist[0]

            confirmed_no_helmet = (
                has_no_helmet
                and sum(hist) >= NO_HELMET_MIN_HITS
            )

            if frame_count % 20 == 0:
                logger.info(
                    f"[NH-DECIDE] ID={bike_id} helmets={n_helmet} persons={persons_on_bike} "
                    f"has_nh={has_no_helmet} confirm={confirmed_no_helmet}"
                )

            has_overload = persons_on_bike > MAX_PERSONS_PER_BIKE

            if has_overload:
                bike_ol_streak[bike_id] = bike_ol_streak.get(bike_id, 0) + 1
            else:
                bike_ol_streak[bike_id] = 0

            confirmed_overload = (
                has_overload and bike_ol_streak[bike_id] >= OVERLOAD_MIN_HITS
            )

            if n_helmet > 0:
                cv2.putText(annotated_frame, "MU:OK",
                            (bx1, max(20, by1 - 28)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 0), 2)
            elif confirmed_no_helmet:
                cv2.putText(annotated_frame, "MU:KHONG",
                            (bx1, max(20, by1 - 28)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 255), 2)

            if persons_on_bike > 0:
                color = (0, 0, 255) if confirmed_overload else (0, 255, 0)
                cv2.putText(
                    annotated_frame,
                    f"{persons_on_bike} nguoi",
                    (bx1, by1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6, color, 2,
                )

            # ✅ Kiểm tra điều kiện tiệm cận với tọa độ vạch AI (động theo frame)
            # ✅ Tiệm cận vạch AI để kích hoạt lưu vi phạm. 
            # Mở rộng biên độ chụp ảnh (từ vạch lùi về sau 150 pixel và tiến lên trước 50 pixel)
            if current_stop_y > 0:
                is_near_threshold = (current_stop_y - 150 <= by2 <= current_stop_y + 50)
            else:
                is_near_threshold = (by2 >= h_frame - 100)
            clean_lp = (detected_lp_str.replace(" ", "").replace("-", "")
                        if detected_lp_str else "")
            has_valid_lp = len(clean_lp) >= 7
            has_red_light_violation = (bike_id in red_light_violator_history)
            if bike_id not in bike_recorded_violations:
                bike_recorded_violations[bike_id] = {
                    'NO_HELMET': -1,
                    'RED_LIGHT': -1,
                    'OVERLOAD': -1,
                }

            current_violations = []
            if confirmed_no_helmet and persons_on_bike >= 1:
                current_violations.append("NO_HELMET")
            if has_red_light_violation:
                current_violations.append("RED_LIGHT")
            if confirmed_overload:
                current_violations.append("OVERLOAD")

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

                # Global dedup
                if (prev_lp_len == -1 and has_valid_lp
                        and (clean_lp, v_type) in global_recorded_plates):
                    logger.warning(
                        f"[Dedup] Bỏ qua vi phạm trùng: ID={bike_id} "
                        f"Biển={clean_lp} Loại={v_type}"
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
                        bike_w = bx2 - bx1
                        pad_tail_x = int(bike_w * 0.25) + 25
                        tail_x1 = max(0, bx1 - pad_tail_x)
                        tail_x2 = min(w_frame, bx2 + pad_tail_x)
                        tail_y1 = max(0, by1 + int((by2 - by1) * 0.50))
                        tail_crop = frame[tail_y1:by2, tail_x1:tail_x2]
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

                # ✅ Bắt đầu ghi video clip
                video_recorder.start_recording(bike_id, v_type)

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
                    bike_w = bx2 - bx1
                    pad_tail_x = int(bike_w * 0.25) + 25
                    tail_x1 = max(0, bx1 - pad_tail_x)
                    tail_x2 = min(w_frame, bx2 + pad_tail_x)
                    tail_y1 = max(0, by1 + int((by2 - by1) * 0.55))
                    fallback_lp = frame[tail_y1:by2,
                                        tail_x1:tail_x2]
                    if fallback_lp.size > 0:
                        cv2.imwrite(lp_evidence_path, fallback_lp)
                    else:
                        lp_evidence_path = None

                # ---- Log ----
                now_str = datetime.now().isoformat()
                violation_name_vn = VIOLATION_NAME_MAP.get(v_type, v_type)
                tag = ("CẬP NHẬT BIỂN SỐ RÕ NÉT" if is_update_from_unknown
                       else "PHÁT HIỆN VI PHẠM GIAO THÔNG")

                logger.info("=" * 65)
                logger.info(f"🚨 {tag} #{violation_count} (Xe ID: {bike_id})")
                logger.info(f"-> Biển số xe   : "
                            f"{detected_lp_str if detected_lp_str else 'CHƯA RÕ BIỂN SỐ'}")
                logger.info(f"-> Lỗi vi phạm  : {violation_name_vn}")
                logger.info(f"-> Mức phạt     : {format_fine_text(v_type)}")
                logger.info(f"-> Căn cứ PL    : {get_fine_for_violation(v_type)['legal_basis']}")
                if v_type == "OVERLOAD":
                    logger.info(f"-> Số người     : {persons_on_bike}")
                logger.info(f"-> Thời gian    : {now_str}")
                logger.info(f"-> Bằng chứng xe: {evidence_path}")
                if lp_evidence_path and os.path.exists(lp_evidence_path):
                    logger.info(f"-> Ảnh biển số  : {lp_evidence_path}")
                logger.info("=" * 65)

                # ---- Gửi API ----
                light_val = "red" if v_type == "RED_LIGHT" else None
                if v_type == "NO_HELMET":
                    conf_val = no_helmet_conf
                elif v_type == "OVERLOAD":
                    conf_val = 0.85
                else:
                    conf_val = 0.95

                # ✅ Lấy thông tin mức phạt
                fine_info = get_fine_for_violation(v_type)

                # ✅ MỚI — Session ID từ video filename (fallback nếu None)
                session_id_val = (
                    video_filename 
                    or os.path.basename(video_path) if isinstance(video_path, str) 
                    else f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                )

                threading.Thread(
                    target=send_violation,
                    args=(bike_id, detected_lp_str, v_type,
                          conf_val, now_str, evidence_path),
                    kwargs={
                        "light_status": light_val,
                        "plate_image_path": lp_evidence_path,
                        # ✅ MỚI — Thông tin mức phạt
                        "fine_min": fine_info["min"],
                        "fine_max": fine_info["max"],
                        "fine_text": format_fine_text(v_type),
                        "legal_basis": fine_info["legal_basis"],
                        # ✅ MỚI — Session ID
                        "session_id": session_id_val,
                    },
                    daemon=True,
                ).start()

            # ========================================================
            # # BỔ SUNG: HIỂN THỊ CỬA SỔ THEO DÕI AI TRÊN MÁY TÍNH
            # cv2.namedWindow("Smart Traffic Monitoring", cv2.WINDOW_NORMAL)
            
            # # Cố định chiều cao cửa sổ cho dễ nhìn (vd: 720p)
            # disp_h = 720
            # disp_w = int(disp_h * (w_frame / h_frame))
            # cv2.resizeWindow("Smart Traffic Monitoring", disp_w, disp_h)
            
            # # Hiển thị frame đã được vẽ khung xanh đỏ
            # cv2.imshow("Smart Traffic Monitoring", annotated_frame)
            
            # # Nhấn phím 'q' trên bàn phím để tắt ngang video nếu muốn
            # if cv2.waitKey(1) & 0xFF == ord('q'):
            #     logger.info("Người dùng đã tắt ngang video.")
            #     break
            # ========================================================

        # ---- Dọn dẹp track ----
        expired_ids = [bid for bid, last_frame in bike_last_seen.items()
                       if frame_count - last_frame > TRACK_TIMEOUT_FRAMES]
        for bid in expired_ids:
            bike_plates.pop(bid, None)
            bike_lp_crops.pop(bid, None)
            bike_recorded_violations.pop(bid, None)
            motor_positions_history.pop(bid, None)
            bike_last_seen.pop(bid, None)
            bike_plate_votes.pop(bid, None)
            bike_nh_streak.pop(bid, None)
            bike_nh_history.pop(bid, None)
            bike_ol_streak.pop(bid, None)
            red_light_violator_history.discard(bid)
            bike_pos_history.pop(bid, None)

    cap.release()
    if video_filename and total_frames > 0:
        send_progress(video_filename, total_frames, total_frames, violation_count)
    
    logger.info(f"[HOÀN THÀNH] Tổng số vi phạm bắt được: {violation_count}")


# ================== AUTO VIDEO DISCOVERY + WATCHER ==================

def find_all_videos(video_dir):
    """Tìm tất cả video trong folder."""
    if not os.path.isdir(video_dir):
        os.makedirs(video_dir, exist_ok=True)
        return []
        
    extensions = ('.mp4', '.avi', '.mkv', '.mov', '.webm')
    videos = []
    for f in os.listdir(video_dir):
        full_path = os.path.join(video_dir, f)
        if os.path.isfile(full_path) and f.lower().endswith(extensions):
            videos.append(full_path)
    return sorted(videos)


def process_single_video(video_path):
    """Xử lý 1 video + đánh dấu đã xử lý."""
    base_name = os.path.basename(video_path)
    name, ext = os.path.splitext(base_name)
    
    # Đánh dấu đang xử lý
    processing_path = os.path.join(
        os.path.dirname(video_path),
        f".processing_{name}{ext}"
    )
    
    try:
        # Đổi tên đánh dấu
        os.rename(video_path, processing_path)
        logger.info(f"\n{'='*70}")
        logger.info(f"🎬 BẮT ĐẦU XỬ LÝ: {base_name}")
        logger.info(f"{'='*70}")
        
        # Extract metadata TRƯỚC khi xử lý
        metadata = extract_video_metadata(processing_path)
        if metadata:
            logger.info(f"[Metadata] {metadata}")
        
        # Chạy AI với filename
        run_traffic_system(processing_path, video_filename=base_name)
        
        # Đổi tên đánh dấu hoàn thành
        done_dir = os.path.join(os.path.dirname(video_path), "processed")
        os.makedirs(done_dir, exist_ok=True)
        done_path = os.path.join(done_dir, base_name)
        os.rename(processing_path, done_path)
        
        # Lưu metadata JSON
        if metadata:
            metadata['processed_at'] = datetime.now().isoformat()
            metadata['filename'] = base_name
            meta_path = os.path.join(done_dir, f"{base_name}.json")
            with open(meta_path, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, ensure_ascii=False, indent=2)
            logger.info(f"   → Metadata: {meta_path}")
        
        logger.info(f"\n✅ HOÀN THÀNH: {base_name}")
        logger.info(f"   → Đã di chuyển vào: processed/{base_name}")
        
    except Exception as e:
        import traceback
        logger.error(f"❌ Lỗi xử lý {base_name}: {e}")
        logger.error(traceback.format_exc()) # In ra dòng code bị lỗi cụ thể
        
        # Cố gắng dọn dẹp bộ nhớ OpenCV để nhả file video bị kẹt
        cv2.destroyAllWindows()
        
        if os.path.exists(processing_path):
            try:
                os.rename(processing_path, video_path)
            except Exception as ex:
                logger.error(f"Không thể đổi tên file (vẫn kẹt bộ nhớ), vui lòng khởi động lại Terminal: {ex}")


def auto_watcher(video_dir, stop_flag):
    """
    Thread tự động watch folder + xử lý video mới.
    Cứ 5 giây check 1 lần.
    """
    processed_cache = set()
    
    while not stop_flag["stop"]:
        try:
            videos = find_all_videos(video_dir)
            
            for video in videos:
                # Bỏ qua file đã xử lý
                if video in processed_cache:
                    continue
                    
                # Bỏ qua file tạm
                if ".processing_" in video:
                    continue
                    
                logger.info(f"🔔 Phát hiện video mới: {os.path.basename(video)}")
                processed_cache.add(video)
                process_single_video(video)
                
            time.sleep(5)
            
        except Exception as e:
            logger.error(f"Watcher lỗi: {e}")
            time.sleep(10)

# ================== HTTP SERVER ĐỂ NHẬN CANCEL ==================
def start_cancel_listener():
    """Chạy HTTP server nhỏ để nhận cancel request từ backend."""
    from http.server import BaseHTTPRequestHandler, HTTPServer
    import json as _json

    class CancelHandler(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path == '/cancel':
                content_length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_length).decode('utf-8')
                try:
                    data = _json.loads(body)
                    filename = data.get('filename')
                    if filename:
                        CANCEL_FLAGS.add(filename)
                        print(f"  [Cancel] Nhận cancel cho: {filename}", flush=True)
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(b'{"success": true}')
                        return
                except Exception as e:
                    print(f"  [Cancel] Lỗi: {e}", flush=True)

            self.send_response(400)
            self.end_headers()

        def log_message(self, format, *args):
            pass   # Tắt log

    server = HTTPServer(('0.0.0.0', 9999), CancelHandler)
    print("  [Cancel Server] Đang nghe tại port 9999...", flush=True)
    server.serve_forever()

def start_cancel_listener_thread():
    """Chạy listener trong thread riêng."""
    import threading
    t = threading.Thread(target=start_cancel_listener, daemon=True)
    t.start()


if __name__ == "__main__":
    # Config
    VIDEO_DIR = os.getenv("VIDEO_DIR", "/app/videos")
    # VIDEO_DIR = os.getenv("VIDEO_DIR", "videos")
    SINGLE_VIDEO = os.getenv("VIDEO_PATH", "").strip()
    
    logger.info(f"\n{'='*70}")
    logger.info(f"🎥 HỆ THỐNG XỬ LÝ VIDEO GIAO THÔNG")
    logger.info(f"{'='*70}")
    logger.info(f"📁 Video folder: {VIDEO_DIR}")

    # ✅ Khởi động cancel listener
    start_cancel_listener_thread()
    
    # Cách 1: Chạy 1 video cụ thể (nếu có VIDEO_PATH)
    if SINGLE_VIDEO and SINGLE_VIDEO != "0" and os.path.exists(SINGLE_VIDEO):
        logger.info(f"📹 Chạy video cụ thể: {SINGLE_VIDEO}")
        logger.info(f"{'='*70}\n")
        run_traffic_system(SINGLE_VIDEO)
        logger.info(f"\n✅ HOÀN THÀNH\n")
        
    # Cách 2: Tự động watch folder + xử lý tất cả video mới
    else:
        os.makedirs(VIDEO_DIR, exist_ok=True)
        
        logger.info(f"🔍 Chế độ: AUTO WATCH FOLDER")
        logger.info(f"→ Cứ 5 giây check folder 1 lần")
        logger.info(f"→ Copy video vào folder → AI tự chạy")
        logger.info(f"{'='*70}\n")
        
        # Khởi chạy watcher trong thread riêng
        stop_flag = {"stop": False}
        
        try:
            auto_watcher(VIDEO_DIR, stop_flag)
        except KeyboardInterrupt:
            logger.info("\n⏹️ Dừng hệ thống...")
            stop_flag["stop"] = True