from core.ocr import LicensePlateOCR
from core.red_light_logic import RedLightDetector
import os
import requests
import cv2
import numpy as np
from datetime import datetime
from ultralytics import YOLO
from core.ocr import PaddleOCR
from core.detection import analyze_frame
from core.tracking import VehicleTracker
from core.rules import is_violation, build_violation_payload

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")
OUTPUT_DIR = os.path.join(BASE_DIR, "output_violations")
os.makedirs(OUTPUT_DIR, exist_ok=True)

def send_violation_to_api(lp_str, evidence_path, violation_type="NO_HELMET"): # [SỬA] Thêm tham số violation_type
    url = "http://localhost:3000/api/violations"
    try:
        files = {
            'panorama_image': (os.path.basename(evidence_path), open(evidence_path, 'rb'), 'image/jpeg'),
            'license_plate_image': (os.path.basename(evidence_path), open(evidence_path, 'rb'), 'image/jpeg')
        }
        data = {
            'license_plate': lp_str if lp_str else 'CHƯA RÕ BIỂN SỐ',
            'vehicle_type': 'MOTORCYCLE',
            'violation_type': violation_type # [SỬA] Truyền loại vi phạm động
        }
        res = requests.post(url, data=data, files=files)
        print(f"-> [API] Đã đẩy dữ liệu thành công! (Mã lỗi: {res.status_code})")
    except Exception as e:
        print(f"-> [API] Lỗi kết nối Backend: {e}")
    finally:
        if 'files' in locals():
            files['panorama_image'][1].close()
            files['license_plate_image'][1].close()

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
    """Kiểm tra xem bounding box có chứa tỷ lệ pixel màu trắng/sáng lớn không (đặc trưng của mũ bảo hiểm màu trắng)"""
    if crop is None or crop.size == 0:
        return False
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    v_channel = hsv[:, :, 2] # Độ sáng
    s_channel = hsv[:, :, 1] # Độ bão hòa màu
    
    # Đếm số lượng pixel màu trắng/xám sáng (V > 135 và S < 90)
    white_pixels = np.sum((v_channel > 135) & (s_channel < 90))
    total_pixels = crop.shape[0] * crop.shape[1]
    white_ratio = white_pixels / float(total_pixels + 1e-5)
    
    # Nếu vùng được chọn có trên 35% diện tích là màu trắng/sáng -> Là mũ bảo hiểm trắng
    return white_ratio > 0.35

def run_traffic_system(video_path):
    
    # --------------------------------------------------------------------------
    # [CẤU HÌNH MÔ HÌNH XE MÁY]
    # Mặc định dùng YOLOv8n chuẩn (nhanh và chính xác trên video thực tế)


    # KHI CẦN DÙNG MOTO_BEST.PT THÌ MỞ GHI CHÚ 2 DÒNG DƯỚI VÀ ĐÓNG 2 DÒNG TRÊN LẠI:
    # moto_model_path = os.path.join(MODELS_DIR, "moto_best.pt")
    # moto_model = YOLO(moto_model_path)
    # use_yolo_fallback = False
    # --------------------------------------------------------------------------
    # print("[1/3] Đang nạp các mô hình AI...")
    # moto_model = YOLO("yolov8n.pt")
    # use_yolo_fallback = True
    # helmet_lp_model = YOLO(os.path.join(MODELS_DIR, "helmet_lp_best.pt"))

    # ocr_model = build_vgg19()
    # ocr_model.load_weights(os.path.join(MODELS_DIR, "VGG19Model_Final.h5"))
    # print("[2/3] Nạp mô hình thành công!")
    print("[1/3] Đang nạp các mô hình AI...")
    moto_model = YOLO("yolov8n.pt")
    use_yolo_fallback = True
    helmet_model = YOLO(os.path.join(MODELS_DIR, "helmet_lp_best.pt"))
    lp_model = YOLO(os.path.join(MODELS_DIR, "my_lp_model.pt"))

    tl_model = YOLO("yolov8n.pt")

    # KHỞI TẠO PADDLEOCR THAY CHO VGG
    print("Đang nạp PaddleOCR...")
    ocr_model = LicensePlateOCR()
    print("[2/3] Nạp mô hình thành công!")
    tracker = VehicleTracker(screen_threshold_ratio=0.8)
    cap = cv2.VideoCapture(video_path)
    
    # --------------------------------------------------------------------------
    # [GHI CHÚ] CODE TỰ ĐỘNG FALLBACK KHI DÙNG MOTO_BEST.PT (HIỆN TẠI ĐÃ ĐÓNG)
    # ret_test, frame_test = cap.read()
    # cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    # if ret_test is not None and not use_yolo_fallback:
    #     test_res = moto_model.predict(frame_test, conf=0.1, imgsz=1280, verbose=False)[0]
    #     if len(test_res.boxes) == 0:
    #         print("⚠️ Model moto_best.pt không nhận diện được xe, chuyển sang YOLOv8n...")
    #         moto_model = YOLO("yolov8n.pt")
    #         use_yolo_fallback = True
    # --------------------------------------------------------------------------

    violation_count = 0
    print("[3/3] Bắt đầu quét video...")

    # Dictionary lưu giữ thông tin biển số và vi phạm đã xử lý cho từng xe
    bike_plates = {}
    bike_recorded_violations = {}
    
    # [MỚI] Dictionary theo dõi thời gian xuất hiện cuối cùng của xe để chống tràn RAM
    bike_last_seen = {}
    frame_count = 0

    # ========================================================
    # [MỚI THÊM] KHỞI TẠO MODULE ĐÈN ĐỎ & TRACKING VỊ TRÍ
    # ========================================================
    # Lấy thông số frame đầu tiên để vẽ ranh giới vạch kẻ đường
    ret_test, frame_test = cap.read()
    if ret_test:
        h_f, w_f, _ = frame_test.shape
        ty = int(h_f * tracker.screen_threshold_ratio)
        red_light_ai = RedLightDetector(stop_line_coords=[(0, ty), (w_f, ty)])
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0) # Trả video về frame số 0
        
    motor_positions_history = {} # Lưu vết vị trí xe
    red_light_recorded_ids = set() # Tránh gửi báo cáo 1 xe vượt đèn đỏ nhiều lần
    # ========================================================
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
        # Tăng bộ đếm frame
        frame_count += 1 

        # Chỉ xử lý 1 frame sau mỗi 5 frame (Video sẽ chạy nhanh gấp 5 lần)
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
        lp_detections = analyze_frame(lp_model, frame, conf=0.45, imgsz=640) # Model mới train chỉ cần imgsz=640
        helmet_dets = []
        no_helmet_dets = []
        lp_dets = []

        # Ngưỡng Confidence riêng cho lỗi KHÔNG ĐỘI MŨ BẢO HIỂM (đặt lại 0.45 để phát hiện nhạy hơn)
        NO_HELMET_CONF_THRESH = 0.45

        raw_no_helmet_dets = []

        for det in helmet_detections:
            cls_name = det["class_lower"]
            x1, y1, x2, y2 = det["bbox"]
            conf = det["conf"]
            
            # Mapping chính xác nhãn từ mô hình: 1 = 'helmet' (Đội mũ), 2 = 'no helmet' (Không đội mũ)
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

        # Lọc nâng cao cho nhãn NO HELMET (Loại bỏ xung đột với Helmet và loại bỏ Mũ Bảo Hiểm Màu Trắng)
        for nh in raw_no_helmet_dets:
            x1, y1, x2, y2 = nh["bbox"]
            conf = nh["conf"]
            h_w = x2 - x1
            h_h = y2 - y1
            aspect = h_h / float(h_w + 1e-5)
            
            # 1. Kiểm tra tỷ lệ khung hình & threshold
            if conf < NO_HELMET_CONF_THRESH or not (0.4 <= aspect <= 3.0):
                continue
                
            # 2. Kiểm tra IoU xem có bị đè/xung đột với nhãn Helmet (Đội mũ) không
            has_helmet_overlap = False
            for h_det in helmet_dets:
                if compute_iou(nh["bbox"], h_det["bbox"]) > 0.30:
                    has_helmet_overlap = True
                    break
            if has_helmet_overlap:
                continue

            # 3. Kiểm tra xem có phải Mũ Bảo Hiểm Trắng/Sáng màu không (dựa vào dải màu HSV)
            head_crop = frame[max(0, y1):min(h_frame, y2), max(0, x1):min(w_frame, x2)]
            if is_white_helmet(head_crop):
                continue

            # Nếu vượt qua tất cả các bước lọc -> Mới xác nhận là KHÔNG ĐỘI MŨ
            no_helmet_dets.append(nh)
            cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
            cv2.putText(annotated_frame, f"NO HELMET! ({conf:.2f})", (x1, max(30, y1 - 10)), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

        # 3. Theo dõi & Xử lý XE MÁY
        track_kwargs = {"persist": True, "conf": 0.25, "imgsz": 640, "verbose": False}
        if use_yolo_fallback:
            track_kwargs["classes"] = [3] # Class 3 = motorbike
            
        moto_results = moto_model.track(frame, **track_kwargs)[0]
        
        # ========================================================
        # [MỚI THÊM] TÌM ĐÈN GIAO THÔNG VÀ XÉT VƯỢT ĐÈN ĐỎ
        # ========================================================
        tl_results = tl_model.predict(frame, classes=[9], conf=0.15, verbose=False)[0] 
        traffic_light_boxes = tl_results.boxes.xyxy.cpu().numpy() if tl_results.boxes is not None else []
        
        is_red = False
        red_light_violator_ids = []
        boxes = []
        ids = []
        
        if moto_results.boxes is not None:
            boxes = moto_results.boxes.xyxy.cpu().numpy()
            ids = moto_results.boxes.id.int().cpu().numpy() if moto_results.boxes.id is not None else [None] * len(boxes)
            
            # 1. Xác định trạng thái đèn đỏ (bằng OpenCV)
            is_red = False
            for tl_box in traffic_light_boxes:
                tx1, ty1, tx2, ty2 = map(int, tl_box)
                tl_crop = frame[ty1:ty2, tx1:tx2]
                if red_light_ai.is_light_red(tl_crop):
                    is_red = True
                    break
            
            # 2. Cập nhật vị trí xe LIÊN TỤC và xét phạt
            for bbox, track_id in zip(boxes, ids):
                if track_id is not None:
                    # Luôn gọi is_crossing_line để AI "nhớ" vết bánh xe ở mọi frame
                    is_crossing = red_light_ai.is_crossing_line(bbox, track_id, motor_positions_history)
                    
                    # Chỉ phạt nếu xe cắt vạch TRONG LÚC đèn đang đỏ
                    if is_red and is_crossing:
                        red_light_violator_ids.append(track_id)
            
        # ========================================================
        # [MỚI THÊM] VẼ KHOANH VÙNG ĐÈN GIAO THÔNG
        # ========================================================
        if tl_results.boxes is not None:
            for box in tl_results.boxes:
                # Lấy tọa độ và độ tin cậy
                tx1, ty1, tx2, ty2 = map(int, box.xyxy[0].cpu().numpy())
                tl_conf = float(box.conf[0].cpu().numpy())
                
                # Màu đỏ nếu đang là đèn đỏ, xanh nếu không phải
                box_color = (0, 0, 255) if is_red else (0, 255, 0)
                
                # Vẽ khung và chữ
                cv2.rectangle(annotated_frame, (tx1, ty1), (tx2, ty2), box_color, 2)
                cv2.putText(annotated_frame, f"Traffic Light ({tl_conf:.2f})", (tx1, max(20, ty1 - 10)), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, box_color, 2)
        # ========================================================
            
        # Vẽ trạng thái đèn lên góc trái màn hình
        light_status = "RED LIGHT" if is_red else "GREEN LIGHT"
        light_color = (0, 0, 255) if is_red else (0, 255, 0)
        cv2.putText(annotated_frame, f"TRAFFIC LIGHT: {light_status}", (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, light_color, 3)
        # ========================================================

        if moto_results.boxes is not None:
            for box, bike_id in zip(boxes, ids):
                if bike_id is None: 
                    continue
                    
                # Cập nhật thời điểm nhìn thấy xe cuối cùng
                bike_last_seen[bike_id] = frame_count
                
                bx1, by1, bx2, by2 = map(int, box)
                cv2.rectangle(annotated_frame, (bx1, by1), (bx2, by2), (255, 165, 0), 2)
                id_text = f"Motorbike ID:{bike_id}"
                cv2.putText(annotated_frame, id_text, (bx1, max(25, by1 - 8)), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 165, 0), 2)

                # Mở rộng vùng xe để kiểm tra người ngồi trên xe
                expanded_y1 = max(0, by1 - int((by2 - by1) * 1.0))
                head_max_y = by1 + int((by2 - by1) * 0.70) # Mở rộng lên 70% thân xe để đảm bảo không bỏ sót đầu người ngồi thấp

                # 4. Đọc và cập nhật biển số xe liên tục (càng lại gần camera càng rõ nét)
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
                            # read_str = read_license_plate(ocr_model, lp_crop)
                            read_str, ocr_conf = ocr_model.read_plate(lp_crop)
                        # ĐOẠN MỚI: Ưu tiên lấy chuỗi có định dạng chuẩn (có dấu '-')
                        if read_str:
                            # Nếu hiện tại chưa có biển số, hoặc biển số mới có chứa dấu '-' (chuẩn form) mà biển số cũ chưa có
                            if not current_lp_str or ("-" in read_str and "-" not in current_lp_str):
                                current_lp_str = read_str
                                bike_plates[bike_id] = read_str
                            # Nếu cả hai đều có định dạng chuẩn, ưu tiên chuỗi có độ dài hợp lý từ 8-10 ký tự
                            elif "-" in read_str and 8 <= len(read_str.replace(" ", "")) <= 10:
                                current_lp_str = read_str
                                bike_plates[bike_id] = read_str

                detected_lp_str = bike_plates.get(bike_id, "")
                if detected_lp_str:
                    cv2.putText(annotated_frame, f"BS: {detected_lp_str}", (bx1, min(h_frame - 10, by2 + 25)), 
                                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)

                # Kiểm tra vi phạm KHÔNG ĐỘI MŨ BẢO HIỂM trên xe này (Chỉ chấp nhận đầu người ở phần nửa trên của xe)
                has_no_helmet = False
                no_helmet_conf = 0.0
                for nh in no_helmet_dets:
                    hx1, hy1, hx2, hy2 = nh["bbox"]
                    cx_nh, cy_nh = (hx1 + hx2) / 2, (hy1 + hy2) / 2
                    
                    if bx1 - 40 <= hx1 and hx2 <= bx2 + 40 and expanded_y1 <= hy1 and hy2 <= head_max_y:
                        has_no_helmet = True
                        no_helmet_conf = nh["conf"]
                        break

                # Đánh dấu vi phạm & Lưu BẰNG CHỨNG TOÀN BỘ XE + NGƯỜI (Chỉ ghi nhận khi xe lại gần vạch kiểm tra hoặc đã đọc được biển số)
                is_near_threshold = (by2 >= threshold_y - 120)
                clean_lp = detected_lp_str.replace(" ", "").replace("-", "") if detected_lp_str else ""
                has_valid_lp = len(clean_lp) >= 7

                has_red_light_violation = (bike_id in red_light_violator_ids)

                # Khởi tạo sổ theo dõi riêng cho từng lỗi của xe này
                if bike_id not in bike_recorded_violations:
                    bike_recorded_violations[bike_id] = {'NO_HELMET': -1, 'RED_LIGHT': -1}

                # Tạo danh sách các lỗi mà xe này ĐANG mắc phải ở frame hiện tại
                current_violations = []
                if has_no_helmet: 
                    current_violations.append("NO_HELMET")
                if has_red_light_violation: 
                    current_violations.append("RED_LIGHT")

                # Xử lý độc lập từng lỗi
                for v_type in current_violations:
                    # Chỉ lưu bằng chứng khi xe lại gần camera hoặc đã đọc được biển số
                    if bike_id is not None and (is_near_threshold or has_valid_lp):
                        prev_lp_len = bike_recorded_violations[bike_id][v_type]

                        should_save = False
                        is_update_from_unknown = False

                        # 1. Chưa từng lưu lỗi này bao giờ
                        if prev_lp_len == -1:
                            should_save = True
                        # 2. Trước đó lưu nháp chưa có biển số, giờ đã đọc được biển -> Lưu đè
                        elif prev_lp_len == 0 and has_valid_lp:
                            should_save = True
                            is_update_from_unknown = True

                        if should_save:
                            if prev_lp_len == -1:
                                violation_count += 1
                            
                            # Ghi nhận độ dài biển số vào "cuốn sổ" tương ứng với loại lỗi
                            bike_recorded_violations[bike_id][v_type] = len(clean_lp) if has_valid_lp else 0

                            # Cắt toàn bộ hình ảnh chiếc xe máy + người lái + biển số
                            crop_pad = 40
                            crop_y1 = max(0, expanded_y1 - crop_pad)
                            crop_y2 = min(h_frame, by2 + crop_pad)
                            crop_x1 = max(0, bx1 - crop_pad)
                            crop_x2 = min(w_frame, bx2 + crop_pad)

                            evidence_img = frame[crop_y1:crop_y2, crop_x1:crop_x2]
                            lp_clean_file = clean_lp if has_valid_lp else "CHUA_RO_BS"
                            
                            # Xóa file cũ (nếu có) để cập nhật ảnh rõ nét hơn
                            if is_update_from_unknown:
                                old_evidence_path = os.path.join(OUTPUT_DIR, f"violation_ID{bike_id}_{v_type}_CHUA_RO_BS.jpg")
                                if os.path.exists(old_evidence_path):
                                    os.remove(old_evidence_path)
                                    
                            # Tên file ảnh giờ có chứa tên lỗi (v_type) để phân biệt
                            evidence_name = f"violation_ID{bike_id}_{v_type}_{lp_clean_file}.jpg"
                            evidence_path = os.path.join(OUTPUT_DIR, evidence_name)
                            
                            if evidence_img.size > 0:
                                cv2.imwrite(evidence_path, evidence_img)

                            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                            violation_name_vn = "VƯỢT ĐÈN ĐỎ" if v_type == "RED_LIGHT" else "KHÔNG ĐỘI MŨ BẢO HIỂM"
                            
                            tag = "CẬP NHẬT BIỂN SỐ RÕ NÉT" if is_update_from_unknown else "PHÁT HIỆN VI PHẠM GIAO THÔNG"
                            print("=" * 65)
                            print(f"🚨 {tag} #{violation_count} (Xe ID: {bike_id})")
                            print(f"-> Biển số xe  : {detected_lp_str if detected_lp_str else 'CHƯA RÕ BIỂN SỐ'}")
                            print(f"-> Lỗi vi phạm : {violation_name_vn}")
                            print(f"-> Thời gian   : {now_str}")
                            print(f"-> Bằng chứng  : {evidence_path}")
                            print("=" * 65)

                            # Gửi API với đúng loại lỗi
                            send_violation_to_api(detected_lp_str, evidence_path, violation_type=v_type)

        # 7. DỌN RÁC BỘ NHỚ (Giải phóng RAM cho các xe đã đi qua vạch)
        expired_ids = [bid for bid, last_frame in bike_last_seen.items() if frame_count - last_frame > 30]
        for bid in expired_ids:
            if bid in bike_plates: del bike_plates[bid]
            if bid in bike_recorded_violations: del bike_recorded_violations[bid]
            if bid in motor_positions_history: del motor_positions_history[bid] # [MỚI THÊM] Xóa lịch sử vị trí xe
            del bike_last_seen[bid]
        # Hiển thị trực tiếp video giám sát giữ nguyên tỷ lệ khung hình chuẩn
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
    test_video = os.path.join(BASE_DIR, "dendo1.mp4")
    if os.path.exists(test_video):
        run_traffic_system(test_video)
    else:
        print(f"Không tìm thấy file: {test_video}. Hãy copy video vào thư mục ai-service!")