from core.ocr import LicensePlateOCR
from core.red_light_logic import RedLightDetector
import os
import cv2
import numpy as np
import re
import threading
from datetime import datetime
from ultralytics import YOLO

# [BỔ SUNG] Import hàm gửi dữ liệu chuẩn từ file publisher.py
from publisher import send_violation 

from core.detection import analyze_frame
from core.tracking import VehicleTracker
from core.rules import is_violation, build_violation_payload

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")
OUTPUT_DIR = os.path.join(BASE_DIR, "output_violations")
os.makedirs(OUTPUT_DIR, exist_ok=True)

def format_vn_license_plate(raw_text):
    """Xóa các ký tự thừa và chèn dấu '-' chuẩn form biển số xe máy VN"""
    clean_text = re.sub(r'[^A-Z0-9]', '', raw_text.upper())
    if len(clean_text) >= 8:
        return clean_text[:4] + "-" + clean_text[4:]
    return raw_text 

# ĐÃ XÓA HÀM send_violation_to_api CŨ Ở ĐÂY ĐỂ DÙNG CHUNG TỪ PUBLISHER.PY

def compute_iou(boxA, boxB):
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])
    interArea = max(0, xB - xA) * max(0, yB - yA)
    boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
    boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
    return interArea / float(boxAArea + boxBArea - interArea + 1e-5)

def is_white_helmet(crop):
    if crop is None or crop.size == 0:
        return False
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    v_channel = hsv[:, :, 2] 
    s_channel = hsv[:, :, 1] 
    
    white_pixels = np.sum((v_channel > 135) & (s_channel < 90))
    total_pixels = crop.shape[0] * crop.shape[1]
    white_ratio = white_pixels / float(total_pixels + 1e-5)
    
    return white_ratio > 0.35

def run_traffic_system(video_path):
    print("[1/3] Đang nạp các mô hình AI...")
    moto_model = YOLO("yolov8n.pt")
    use_yolo_fallback = True
    helmet_model = YOLO(os.path.join(MODELS_DIR, "helmet_lp_best.pt"))
    lp_model = YOLO(os.path.join(MODELS_DIR, "my_lp_model.pt"))
    tl_model = YOLO("yolov8n.pt")

    print("Đang nạp PaddleOCR...")
    ocr_model = LicensePlateOCR()
    print("[2/3] Nạp mô hình thành công!")
    tracker = VehicleTracker(screen_threshold_ratio=0.8)
    cap = cv2.VideoCapture(video_path)
    
    violation_count = 0
    print("[3/3] Bắt đầu quét video...")

    bike_plates = {}
    bike_recorded_violations = {}
    bike_last_seen = {}
    frame_count = 0

    # KHỞI TẠO MODULE ĐÈN ĐỎ & TRACKING VỊ TRÍ
    ret_test, frame_test = cap.read()
    if ret_test:
        h_f, w_f, _ = frame_test.shape
        ty = int(h_f * tracker.screen_threshold_ratio)
        red_light_ai = RedLightDetector(stop_line_coords=[(0, ty), (w_f, ty)])
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0) 
        
    motor_positions_history = {} 
    red_light_recorded_ids = set() 
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        frame_count += 1 

        if frame_count % 5 != 0: 
            continue

        annotated_frame = frame.copy()
        h_frame, w_frame, _ = frame.shape
        threshold_y = int(h_frame * tracker.screen_threshold_ratio)

        # 1. Vẽ vạch kiểm tra vi phạm
        cv2.line(annotated_frame, (0, threshold_y), (w_frame, threshold_y), (0, 0, 255), 3)
        cv2.putText(annotated_frame, "Vach Kiem Tra Vi Pham", (20, threshold_y - 15), 
                    cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 255), 3)

        # 2. Nhận diện MŨ BẢO HIỂM & BIỂN SỐ
        helmet_detections = analyze_frame(helmet_model, frame, conf=0.35, imgsz=1280)
        lp_detections = analyze_frame(lp_model, frame, conf=0.45, imgsz=640) 
        helmet_dets = []
        no_helmet_dets = []
        lp_dets = []

        NO_HELMET_CONF_THRESH = 0.6
        raw_no_helmet_dets = []

        for det in helmet_detections:
            cls_name = det["class_lower"]
            x1, y1, x2, y2 = det["bbox"]
            conf = det["conf"]
            
            if cls_name in ["helmet", "with_helmet", "with-helmet"]:
                helmet_dets.append(det)
                cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 255, 0), 3)
                cv2.putText(annotated_frame, f"Helmet ({conf:.2f})", (x1, max(30, y1 - 10)), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            elif cls_name in ["no helmet", "no_helmet", "without_helmet", "without-helmet", "no-helmet"]:
                raw_no_helmet_dets.append(det)
            elif cls_name in ["lp", "license_plate", "license-plate", "plate"]:
                lp_dets.append(det)
                cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (255, 0, 0), 3)
                cv2.putText(annotated_frame, "License Plate", (x1, max(30, y1 - 10)), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 0, 0), 2)

        for nh in raw_no_helmet_dets:
            x1, y1, x2, y2 = nh["bbox"]
            conf = nh["conf"]
            h_w = x2 - x1
            h_h = y2 - y1
            aspect = h_h / float(h_w + 1e-5)
            
            if conf < NO_HELMET_CONF_THRESH or not (0.4 <= aspect <= 3.0):
                continue
                
            has_helmet_overlap = False
            for h_det in helmet_dets:
                if compute_iou(nh["bbox"], h_det["bbox"]) > 0.30:
                    has_helmet_overlap = True
                    break
            if has_helmet_overlap:
                continue

            head_crop = frame[max(0, y1):min(h_frame, y2), max(0, x1):min(w_frame, x2)]
            if is_white_helmet(head_crop):
                continue

            no_helmet_dets.append(nh)
            cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
            cv2.putText(annotated_frame, f"NO HELMET! ({conf:.2f})", (x1, max(30, y1 - 10)), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

        # 3. Theo dõi & Xử lý XE MÁY
        track_kwargs = {"persist": True, "conf": 0.15, "imgsz": 800, "iou": 0.9, "verbose": False}
        if use_yolo_fallback:
            track_kwargs["classes"] = [3] 
            
        moto_results = moto_model.track(frame, **track_kwargs)[0]
        
        # TÌM ĐÈN GIAO THÔNG VÀ XÉT VƯỢT ĐÈN ĐỎ
        tl_results = tl_model.predict(frame, classes=[9], conf=0.15, verbose=False)[0] 
        traffic_light_boxes = tl_results.boxes.xyxy.cpu().numpy() if tl_results.boxes is not None else []
        
        is_red = False
        red_light_violator_ids = []
        boxes = []
        ids = []
        
        if moto_results.boxes is not None:
            boxes = moto_results.boxes.xyxy.cpu().numpy()
            ids = moto_results.boxes.id.int().cpu().numpy() if moto_results.boxes.id is not None else [None] * len(boxes)
            
            for tl_box in traffic_light_boxes:
                tx1, ty1, tx2, ty2 = map(int, tl_box)
                tl_crop = frame[ty1:ty2, tx1:tx2]
                if red_light_ai.is_light_red(tl_crop):
                    is_red = True
                    break
            
            for bbox, track_id in zip(boxes, ids):
                if track_id is not None:
                    is_crossing = red_light_ai.is_crossing_line(bbox, track_id, motor_positions_history)
                    if is_red and is_crossing:
                        red_light_violator_ids.append(track_id)
            
        if tl_results.boxes is not None:
            for box in tl_results.boxes:
                tx1, ty1, tx2, ty2 = map(int, box.xyxy[0].cpu().numpy())
                tl_conf = float(box.conf[0].cpu().numpy())
                box_color = (0, 0, 255) if is_red else (0, 255, 0)
                
                cv2.rectangle(annotated_frame, (tx1, ty1), (tx2, ty2), box_color, 2)
                cv2.putText(annotated_frame, f"Traffic Light ({tl_conf:.2f})", (tx1, max(20, ty1 - 10)), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, box_color, 2)
            
        light_status = "RED LIGHT" if is_red else "GREEN LIGHT"
        light_color = (0, 0, 255) if is_red else (0, 255, 0)
        cv2.putText(annotated_frame, f"TRAFFIC LIGHT: {light_status}", (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, light_color, 3)

        if moto_results.boxes is not None:
            for box, bike_id in zip(boxes, ids):
                if bike_id is None: 
                    continue
                    
                bike_last_seen[bike_id] = frame_count
                
                bx1, by1, bx2, by2 = map(int, box)
                cv2.rectangle(annotated_frame, (bx1, by1), (bx2, by2), (255, 165, 0), 2)
                id_text = f"Motorbike ID:{bike_id}"
                cv2.putText(annotated_frame, id_text, (bx1, max(25, by1 - 8)), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 165, 0), 2)

                expanded_y1 = max(0, by1 - int((by2 - by1) * 1.0))
                head_max_y = by1 + int((by2 - by1) * 0.70) 

                current_lp_str = bike_plates.get(bike_id, "")
                for lp in lp_dets:
                    lx1, ly1, lx2, ly2 = lp["bbox"]
                    if bx1 - 30 <= lx1 and lx2 <= bx2 + 30 and by1 - 50 <= ly1 and ly2 <= by2 + 50:
                        lp_pad = 10
                        crop_x1 = max(0, lx1 - lp_pad)
                        crop_y1 = max(0, ly1 - lp_pad)
                        crop_x2 = min(w_frame, lx2 + lp_pad)
                        crop_y2 = min(h_frame, ly2 + lp_pad)
                        lp_crop = frame[crop_y1:crop_y2, crop_x1:crop_x2]

                        read_str = ""
                        if lp_crop.size > 0:
                            read_str, ocr_conf = ocr_model.read_plate(lp_crop)
                            
                        if read_str:
                            clean_chars = "".join(c for c in read_str.upper() if c.isalnum())
                            match_reversed = re.match(r'^(\d{4,5})(\d{2}[A-Z]{1,2}\d?)$', clean_chars)
                            if match_reversed:
                                clean_chars = match_reversed.group(2) + match_reversed.group(1)
                            
                            if len(clean_chars) >= 8:
                                read_str = clean_chars[:4] + "-" + clean_chars[4:]
                            else:
                                read_str = clean_chars
                            
                            if not current_lp_str or ("-" in read_str and "-" not in current_lp_str):
                                current_lp_str = read_str
                                bike_plates[bike_id] = read_str
                            elif "-" in read_str and 8 <= len(read_str.replace(" ", "")) <= 10:
                                current_lp_str = read_str
                                bike_plates[bike_id] = read_str

                detected_lp_str = bike_plates.get(bike_id, "")
                if detected_lp_str:
                    cv2.putText(annotated_frame, f"BS: {detected_lp_str}", (bx1, min(h_frame - 10, by2 + 25)), 
                                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)

                has_no_helmet = False
                no_helmet_conf = 0.0
                for nh in no_helmet_dets:
                    hx1, hy1, hx2, hy2 = nh["bbox"]
                    cx_nh, cy_nh = (hx1 + hx2) / 2, (hy1 + hy2) / 2
                    
                    if bx1 - 40 <= hx1 and hx2 <= bx2 + 40 and expanded_y1 <= hy1 and hy2 <= head_max_y:
                        has_no_helmet = True
                        no_helmet_conf = nh["conf"]
                        break

                is_near_threshold = (by2 >= threshold_y - 120)
                clean_lp = detected_lp_str.replace(" ", "").replace("-", "") if detected_lp_str else ""
                has_valid_lp = len(clean_lp) >= 7

                has_red_light_violation = (bike_id in red_light_violator_ids)

                if bike_id not in bike_recorded_violations:
                    bike_recorded_violations[bike_id] = {'NO_HELMET': -1, 'RED_LIGHT': -1}

                current_violations = []
                if has_no_helmet: 
                    current_violations.append("NO_HELMET")
                if has_red_light_violation: 
                    current_violations.append("RED_LIGHT")

                for v_type in current_violations:
                    if bike_id is not None and (is_near_threshold or has_valid_lp):
                        prev_lp_len = bike_recorded_violations[bike_id][v_type]

                        should_save = False
                        is_update_from_unknown = False

                        if prev_lp_len == -1:
                            should_save = True
                        elif prev_lp_len == 0 and has_valid_lp:
                            should_save = True
                            is_update_from_unknown = True

                        if should_save:
                            if prev_lp_len == -1:
                                violation_count += 1
                            
                            bike_recorded_violations[bike_id][v_type] = len(clean_lp) if has_valid_lp else 0

                            crop_pad = 40
                            crop_y1 = max(0, expanded_y1 - crop_pad)
                            crop_y2 = min(h_frame, by2 + crop_pad)
                            crop_x1 = max(0, bx1 - crop_pad)
                            crop_x2 = min(w_frame, bx2 + crop_pad)

                            evidence_img = frame[crop_y1:crop_y2, crop_x1:crop_x2]
                            lp_clean_file = clean_lp if has_valid_lp else "CHUA_RO_BS"
                            
                            if is_update_from_unknown:
                                old_evidence_path = os.path.join(OUTPUT_DIR, f"violation_ID{bike_id}_{v_type}_CHUA_RO_BS.jpg")
                                if os.path.exists(old_evidence_path):
                                    os.remove(old_evidence_path)
                                    
                            evidence_name = f"violation_ID{bike_id}_{v_type}_{lp_clean_file}.jpg"
                            evidence_path = os.path.join(OUTPUT_DIR, evidence_name)
                            
                            if evidence_img.size > 0:
                                cv2.imwrite(evidence_path, evidence_img)

                            now_str = datetime.now().isoformat()
                            violation_name_vn = "VƯỢT ĐÈN ĐỎ" if v_type == "RED_LIGHT" else "KHÔNG ĐỘI MŨ BẢO HIỂM"
                            
                            tag = "CẬP NHẬT BIỂN SỐ RÕ NÉT" if is_update_from_unknown else "PHÁT HIỆN VI PHẠM GIAO THÔNG"
                            print("=" * 65)
                            print(f"🚨 {tag} #{violation_count} (Xe ID: {bike_id})")
                            print(f"-> Biển số xe  : {detected_lp_str if detected_lp_str else 'CHƯA RÕ BIỂN SỐ'}")
                            print(f"-> Lỗi vi phạm : {violation_name_vn}")
                            print(f"-> Thời gian   : {now_str}")
                            print(f"-> Bằng chứng  : {evidence_path}")
                            print("=" * 65)

                            # =======================================================
                            # [ĐÃ SỬA] DÙNG HÀM TỪ PUBLISHER.PY ĐỂ BẮN API
                            # =======================================================
                            light_val = "red" if v_type == "RED_LIGHT" else None
                            conf_val = no_helmet_conf if v_type == "NO_HELMET" else 0.95
                            
                            api_thread = threading.Thread(
                                target=send_violation, 
                                args=(
                                    bike_id,                   # vehicle_id
                                    detected_lp_str,           # plate_number
                                    v_type,                    # violation_type
                                    conf_val,                  # confidence
                                    now_str,                   # timestamp
                                    evidence_path              # image_path
                                ),
                                kwargs={
                                    "light_status": light_val  # Trạng thái đèn
                                }
                            )
                            api_thread.start()

        # 7. DỌN RÁC BỘ NHỚ
        expired_ids = [bid for bid, last_frame in bike_last_seen.items() if frame_count - last_frame > 30]
        for bid in expired_ids:
            if bid in bike_plates: del bike_plates[bid]
            if bid in bike_recorded_violations: del bike_recorded_violations[bid]
            if bid in motor_positions_history: del motor_positions_history[bid] 
            del bike_last_seen[bid]
            
        cv2.namedWindow("Smart Traffic Monitoring", cv2.WINDOW_NORMAL)
        disp_h = 720
        disp_w = int(disp_h * (w_frame / h_frame))
        cv2.resizeWindow("Smart Traffic Monitoring", disp_w, disp_h)
        cv2.imshow("Smart Traffic Monitoring", annotated_frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()
    print(f"\n[HOÀN THÀNH] Tổng số vi phạm bắt được: {violation_count}")

if __name__ == "__main__":
    test_video = os.path.join(BASE_DIR, "dendo2.mp4")
    if os.path.exists(test_video):
        run_traffic_system(test_video)
    else:
        print(f"Không tìm thấy file: {test_video}. Hãy copy video vào thư mục ai-service!")