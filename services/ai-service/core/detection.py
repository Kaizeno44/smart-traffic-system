import cv2
import numpy as np

def detect_motorbikes(moto_model, frame, screen_threshold_y=0.2):
    """Phát hiện xe máy và lọc những xe vượt qua vạch ranh giới"""
    h_frame, w_frame, _ = frame.shape
    thresh_y = int(h_frame * screen_threshold_y)
    
    results = moto_model.predict(frame, conf=0.6, verbose=False)[0]
    passed_bikes = []
    
    for box in results.boxes:
        x_min, y_min, x_max, y_max = map(int, box.xyxy[0].cpu().numpy())
        center_y = (y_min + y_max) // 2
        
        # Chỉ lấy xe vượt qua vạch ngưỡng
        if center_y >= thresh_y:
            cropped_bike = frame[max(0, y_min):min(h_frame, y_max), max(0, x_min):min(w_frame, x_max)]
            passed_bikes.append({
                "bbox": (x_min, y_min, x_max, y_max),
                "image": cropped_bike
            })
    return passed_bikes, thresh_y


def analyze_frame(model, frame, conf=0.22, imgsz=1280):
    """
    Phát hiện đối tượng (Mũ bảo hiểm hoặc Biển số) trên toàn bộ khung hình.
    Đã đổi tên biến thành 'model' cho tổng quát và dùng .predict() để tăng tối đa FPS.
    """
    results = model.predict(frame, conf=conf, imgsz=imgsz, verbose=False)[0]
    detections = []

    if results.boxes is not None:
        boxes = results.boxes.xyxy.cpu().numpy()
        clss = results.boxes.cls.cpu().numpy()
        confs = results.boxes.conf.cpu().numpy()
        
        for box, cls_id, conf_val in zip(boxes, clss, confs):
            int_cls = int(cls_id)
            raw_name = results.names.get(int_cls, "unknown")
            x1, y1, x2, y2 = map(int, box)
            detections.append({
                "class": raw_name,
                "class_lower": raw_name.lower().strip(),
                "conf": float(conf_val),
                "bbox": (x1, y1, x2, y2)
            })
    return detections


def analyze_helmet_and_lp(helmet_lp_model, bike_img):
    if bike_img is None or bike_img.size == 0:
        return False, False, [], []

    results = helmet_lp_model.predict(bike_img, conf=0.25, imgsz=640, verbose=False)[0] 
    has_helmet = False
    has_no_helmet = False
    lp_crops = []
    detect_details = []
    
    for box in results.boxes:
        cls_id = int(box.cls[0])
        raw_name = results.names.get(cls_id, "unknown")
        cls_name = raw_name.lower().strip()
        x1, y1, x2, y2 = map(int, box.xyxy[0].cpu().numpy())
        detect_details.append({"class": raw_name, "bbox": (x1, y1, x2, y2)})
        
        # Mapping chuẩn nhãn từ mô hình: 'helmet' = Đội mũ, 'no helmet' = Không đội mũ
        if cls_name in ["helmet", "with_helmet", "with-helmet"]:
            has_helmet = True
        elif cls_name in ["no helmet", "no_helmet", "without_helmet", "without-helmet", "no-helmet"]:
            has_no_helmet = True
        elif cls_name in ["lp", "license_plate", "license-plate", "plate"]:
            lp_crop = bike_img[max(0, y1):min(bike_img.shape[0], y2), max(0, x1):min(bike_img.shape[1], x2)]
            if lp_crop.size > 0:
                lp_crops.append(lp_crop)
                
    return has_helmet, has_no_helmet, lp_crops, detect_details