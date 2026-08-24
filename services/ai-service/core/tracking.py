import cv2
import numpy as np

class VehicleTracker:
    def __init__(self, screen_threshold_ratio=0.2):
        """
        Quản lý việc theo dõi và lọc xe vi phạm
        :param screen_threshold_ratio: Tỷ lệ vạch ranh giới so với chiều cao khung hình (mặc định 20%)
        """
        self.processed_ids = set()  # Lưu danh sách ID xe đã bị ghi nhận vi phạm
        self.screen_threshold_ratio = screen_threshold_ratio

    def track_and_filter_bikes(self, moto_model, frame):
        """
        Sử dụng YOLO ByteTrack / BoT-SORT tích hợp sẵn để theo dõi xe và lọc qua vạch
        """
        h_frame, w_frame, _ = frame.shape
        threshold_y = int(h_frame * self.screen_threshold_ratio)
        
        # Chạy YOLO với chế độ tracking (persist=True để giữ nguyên ID qua từng frame)
        results = moto_model.track(frame, persist=True, conf=0.25, imgsz=640, verbose=False)[0]        
        passed_bikes = []
        
        # Vẽ vạch ranh giới kiểm tra
        cv2.line(frame, (0, threshold_y), (w_frame, threshold_y), (0, 0, 255), 2)
        cv2.putText(frame, "Vach Kiem Tra", (10, threshold_y - 10), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

        if results.boxes is not None and results.boxes.id is not None:
            boxes = results.boxes.xyxy.cpu().numpy()
            track_ids = results.boxes.id.int().cpu().numpy()

            for box, track_id in zip(boxes, track_ids):
                x_min, y_min, x_max, y_max = map(int, box)
                center_x = (x_min + x_max) // 2
                center_y = (y_min + y_max) // 2

                # Vẽ tâm xe và hiển thị ID
                cv2.circle(frame, (center_x, center_y), 4, (0, 255, 0), -1)
                cv2.putText(frame, f"ID: {track_id}", (x_min, y_min - 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

                # Điều kiện: Xe đã vượt qua vạch VÀ chưa từng bị xử phạt trước đó
                if center_y >= threshold_y:
                    box_h = y_max - y_min
                    pad_top = int(box_h * 0.35)  # Mở rộng 35% lên phía trên để bao trọn đầu/mũ bảo hiểm người lái
                    crop_y_min = max(0, y_min - pad_top)
                    crop_y_max = min(h_frame, y_max)
                    crop_x_min = max(0, x_min)
                    crop_x_max = min(w_frame, x_max)

                    cropped_bike = frame[crop_y_min:crop_y_max, crop_x_min:crop_x_max]
                    
                    if cropped_bike.size > 0:
                        passed_bikes.append({
                            "track_id": track_id,
                            "bbox": (x_min, y_min, x_max, y_max),
                            "crop_offset": (crop_x_min, crop_y_min),
                            "image": cropped_bike
                        })

        return passed_bikes, frame

    def mark_as_processed(self, track_id):
        """Đánh dấu xe này đã bị phạt để các frame tiếp theo không phạt lại"""
        self.processed_ids.add(track_id)

    def is_processed(self, track_id):
        """Kiểm tra xem xe đã được ghi nhận trước đó hay chưa"""
        return track_id in self.processed_ids