import cv2
import numpy as np

class RedLightDetector:
    def __init__(self, stop_line_coords):
        # stop_line_coords là tọa độ của vạch dừng, ví dụ: [(100, 500), (800, 500)]
        self.stop_line = stop_line_coords

    def is_light_red(self, traffic_light_crop):
        """
        Dùng OpenCV để kiểm tra xem đèn giao thông đang cắt ra có phải màu đỏ không.
        Đã tinh chỉnh dải màu và tỷ lệ diện tích.
        """
        if traffic_light_crop is None or traffic_light_crop.size == 0:
            return False

        # Chỉ cắt lấy NỬA TRÊN của đèn giao thông để xét (vì đèn đỏ luôn nằm ở trên cùng)
        # Cách này giúp loại bỏ nhiễu màu đỏ từ biển báo hoặc xe cộ lọt vào nửa dưới của box
        h_crop = traffic_light_crop.shape[0]
        top_half = traffic_light_crop[0:int(h_crop/2), :]

        # Chuyển ảnh sang không gian màu HSV
        hsv = cv2.cvtColor(top_half, cv2.COLOR_BGR2HSV)
        
        # Nới lỏng dải màu đỏ (Bắt được cả màu đỏ cam và đỏ lóa nắng)
        # Giảm Saturation (S) và Value (V) xuống 50 để bắt màu nhạt hơn
        lower_red_1 = np.array([0, 50, 50])
        upper_red_1 = np.array([10, 255, 255])
        
        # Mở rộng dải Hue (H) từ 160 thay vì 170 để bắt được ánh cam đỏ
        lower_red_2 = np.array([160, 50, 50])
        upper_red_2 = np.array([180, 255, 255])
        
        mask1 = cv2.inRange(hsv, lower_red_1, upper_red_1)
        mask2 = cv2.inRange(hsv, lower_red_2, upper_red_2)
        mask = mask1 + mask2
        
        # Đếm số pixel màu đỏ
        red_pixels = cv2.countNonZero(mask)
        total_pixels = top_half.shape[0] * top_half.shape[1]
        
        # Hạ ngưỡng diện tích xuống 5% (vì đèn đỏ chỉ chiếm 1 phần nhỏ của khung hình)
        if total_pixels > 0 and (red_pixels / total_pixels) > 0.05:
            return True
            
        return False
    def is_crossing_line(self, bbox, track_id, previous_positions):
        """
        Kiểm tra xem xe máy (bbox) có đang cắt qua vạch dừng (stop_line) không.
        previous_positions là dictionary lưu vị trí tâm xe ở các frame trước để đối chiếu.
        """
        x1, y1, x2, y2 = bbox
        
        # Lấy điểm tâm đáy của xe máy (nơi bánh xe chạm đất)
        current_center_bottom = (int((x1 + x2) / 2), int(y2))
        
        if track_id not in previous_positions:
            previous_positions[track_id] = current_center_bottom
            return False

        prev_center = previous_positions[track_id]
        
        # Logic giao điểm giữa đoạn thẳng (xe di chuyển) và đoạn thẳng (vạch dừng ảo)
        # Để đơn giản hóa, nếu xe đi từ trên xuống dưới qua vạch y của stop_line:
        line_y = self.stop_line[0][1] # Giả sử vạch kẻ ngang hoàn toàn
        
        if prev_center[1] < line_y and current_center_bottom[1] >= line_y:
            # Cập nhật lại vị trí
            previous_positions[track_id] = current_center_bottom
            return True
            
        previous_positions[track_id] = current_center_bottom
        return False

    def check_violation(self, frame, traffic_light_bboxes, motorbike_bboxes, track_ids, previous_positions):
        """
        Hàm chính gọi từ bên ngoài để xét vi phạm.
        """
        light_is_red = False
        
        # 1. Kiểm tra trạng thái đèn (chỉ cần 1 đèn trong khung hình đỏ là tính đỏ)
        for tl_box in traffic_light_bboxes:
            tx1, ty1, tx2, ty2 = map(int, tl_box)
            tl_crop = frame[ty1:ty2, tx1:tx2]
            if self.is_light_red(tl_crop):
                light_is_red = True
                break
                
        violation_ids = []
        
        # 2. Nếu đèn đỏ, kiểm tra xem xe nào vượt vạch
        if light_is_red:
            for bbox, track_id in zip(motorbike_bboxes, track_ids):
                if self.is_crossing_line(bbox, track_id, previous_positions):
                    violation_ids.append(track_id)
                    
        return light_is_red, violation_ids