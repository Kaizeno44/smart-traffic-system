"""
Lane Detector — Phát hiện vạch dừng thực tế trên đường.
Sử dụng: Color filter + Canny + Hough Line Transform.

Logic:
1. Crop vùng ROI (nửa dưới frame)
2. Filter pixel màu trắng (vạch kẻ đường VN)
3. Canny edge detection
4. Hough Line Transform để tìm đường thẳng
5. Filter: góc < 8° so với ngang, nằm ở nửa dưới, dài > threshold
6. Chọn đường dài nhất → vạch dừng
"""
import cv2
import numpy as np
from typing import Optional, Tuple, List


class LaneDetector:
    """Phát hiện vạch dừng ngang trên đường."""

    def __init__(
        self,
        roi_top_ratio: float = 0.55,      # ROI bắt đầu từ 55% chiều cao
        roi_bottom_ratio: float = 0.95,  # ROI kết thúc ở 95%
        min_line_length_ratio: float = 0.25,  # Tăng từ 0.15 → 0.25
        max_line_gap: int = 30,
        angle_threshold: float = 8.0,    # GIẢM từ 20 → 8 độ
        canny_low: int = 50,
        canny_high: int = 150,
        debug: bool = False,
        history_size: int = 10,
        stability_threshold: int = 3
    ):
        self.roi_top_ratio = roi_top_ratio
        self.roi_bottom_ratio = roi_bottom_ratio
        self.min_line_length_ratio = min_line_length_ratio
        self.max_line_gap = max_line_gap
        self.angle_threshold = angle_threshold
        self.canny_low = canny_low
        self.canny_high = canny_high
        self.debug = debug
        self.history = []                    # Lưu vạch detect gần đây
        self.history_size = history_size
        self.stability_threshold = stability_threshold

    def _check_stability(self, stop_line):
        """
        Kiểm tra vạch có ổn định qua nhiều frame không.
        Trả về vạch đã smooth (nếu stable) hoặc None.
        """
        if stop_line is None:
            self.history.append(None)
            if len(self.history) > self.history_size:
                self.history.pop(0)
            return None
        
        # Thêm vào history
        self.history.append(stop_line)
        if len(self.history) > self.history_size:
            self.history.pop(0)
        
        # Đếm số frame có vạch gần đây
        recent = [h for h in self.history[-5:] if h is not None]
        
        if len(recent) < self.stability_threshold:
            # Chưa đủ stable
            return None
        
        # Trung bình vị trí Y của các vạch gần đây
        avg_y1 = int(np.mean([h[0][1] for h in recent]))
        avg_y2 = int(np.mean([h[1][1] for h in recent]))
        avg_x1 = int(np.mean([h[0][0] for h in recent]))
        avg_x2 = int(np.mean([h[1][0] for h in recent]))
        
        return ((avg_x1, avg_y1), (avg_x2, avg_y2))

    def _detect_white_yellow(self, roi_bgr: np.ndarray) -> np.ndarray:
        """
        Mask pixel màu trắng (vạch kẻ đường).
        Trả về mask nhị phân (0/255).
        """
        hsv = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2HSV)

        # Vạch TRẮNG — chặt hơn
        white_lower = np.array([0, 0, 200])     # Tăng V từ 180 → 200
        white_upper = np.array([180, 30, 255])  # Giảm S từ 40 → 30
        mask = cv2.inRange(hsv, white_lower, white_upper)

        # KHÔNG dùng vàng nữa (vì vạch dừng VN là trắng)
        
        kernel = np.ones((5, 5), np.uint8)       # Tăng kernel từ 3 → 5
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)

        return mask

    def _filter_horizontal_lines(self, lines: np.ndarray) -> List[Tuple[int, int, int, int]]:
        """
        Lọc chỉ giữ các đường gần ngang (|angle| < threshold).
        Trả về list các đường [(x1, y1, x2, y2), ...].
        """
        if lines is None:
            return []

        filtered = []
        for line in lines:
            x1, y1, x2, y2 = line[0]

            # Tính góc (độ)
            dx = x2 - x1
            dy = y2 - y1
            if dx == 0:
                continue  # Đường thẳng đứng → bỏ

            angle = abs(np.degrees(np.arctan2(dy, dx)))

            # Chấp nhận góc < threshold hoặc > 180 - threshold
            if angle < self.angle_threshold or angle > (180 - self.angle_threshold):
                filtered.append((x1, y1, x2, y2))

        return filtered

    def _merge_lines(self, lines, img_width):
        if not lines:
            return None
        # Filter: vạch phải có tâm nằm trong 20-80% chiều rộng (không sát mép)
        center_min = img_width * 0.15
        center_max = img_width * 0.85
        
        valid_lines = []
        for line in lines:
            x1, y1, x2, y2 = line
            cx = (x1 + x2) / 2.0
            if center_min <= cx <= center_max:
                # Vạch phải dài ít nhất 30% chiều rộng
                length = np.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
                if length >= img_width * 0.25:      # Tăng từ 0.15 → 0.25
                    valid_lines.append((line, length))
        
        if not valid_lines:
            return None
        
        # Chọn vạch dài nhất trong số hợp lệ
        valid_lines.sort(key=lambda x: x[1], reverse=True)
        return valid_lines[0][0]

    def detect(self, frame: np.ndarray) -> Optional[Tuple[Tuple[int, int], Tuple[int, int]]]:
        """
        Phát hiện vạch dừng trong frame.

        Args:
            frame: ảnh BGR (full frame)

        Returns:
            ((x1, y1), (x2, y2)) — tọa độ 2 đầu vạch dừng trong frame
            None nếu không detect được
        """
        stop_line_raw = None

        if frame is not None and frame.size > 0:
            h, w = frame.shape[:2]

            # 1. Crop ROI — nửa dưới frame
            roi_y1 = int(h * self.roi_top_ratio)
            roi_y2 = int(h * self.roi_bottom_ratio)
            roi = frame[roi_y1:roi_y2, 0:w]

            if roi.size > 0:
                # 2. Detect pixel vạch trắng/vàng
                mask = self._detect_white_yellow(roi)

                # 3. Canny
                edges = cv2.Canny(mask, self.canny_low, self.canny_high)

                # 4. Hough Transform
                min_line_length = int(w * self.min_line_length_ratio)
                lines = cv2.HoughLinesP(
                    edges,
                    rho=1,
                    theta=np.pi / 180,
                    threshold=50,
                    minLineLength=min_line_length,
                    maxLineGap=self.max_line_gap,
                )

                # 5. Filter đường ngang
                horizontal_lines = self._filter_horizontal_lines(lines)
                
                if horizontal_lines:
                    # 6. Gộp → chọn vạch dài nhất
                    longest = self._merge_lines(horizontal_lines, w)
                    
                    if longest is not None:
                        # 7. Chuyển tọa độ về frame gốc (cộng lại roi_y1)
                        x1, y1, x2, y2 = longest
                        y1 += roi_y1
                        y2 += roi_y1

                        # 8. Sort theo trục X (trái → phải)
                        if x1 > x2:
                            x1, y1, x2, y2 = x2, y2, x1, y1

                        # 9. Debug log
                        if self.debug:
                            angle = abs(np.degrees(np.arctan2(y2 - y1, x2 - x1)))
                            length = np.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
                            print(f"  [LaneDetector] Vạch dừng: ({x1},{y1}) → ({x2},{y2}) | "
                                  f"dài={length:.0f}px | góc={angle:.1f}°")
                        
                        stop_line_raw = ((x1, y1), (x2, y2))

        # Smooth với history
        stop_line = self._check_stability(stop_line_raw)

        return stop_line

    def visualize(self, frame: np.ndarray, stop_line: Optional[Tuple[Tuple[int, int], Tuple[int, int]]]) -> np.ndarray:
        """
        Vẽ vạch dừng lên frame để debug.
        Trả về frame đã vẽ.
        """
        vis = frame.copy()

        # Vẽ ROI
        h, w = frame.shape[:2]
        roi_y1 = int(h * self.roi_top_ratio)
        roi_y2 = int(h * self.roi_bottom_ratio)
        cv2.rectangle(vis, (0, roi_y1), (w, roi_y2), (255, 200, 0), 2)
        cv2.putText(vis, "ROI", (10, roi_y1 + 25), cv2.FONT_HERSHEY_SIMPLEX,
                    0.7, (255, 200, 0), 2)

        # Vẽ vạch dừng
        if stop_line is not None:
            (x1, y1), (x2, y2) = stop_line
            cv2.line(vis, (x1, y1), (x2, y2), (0, 255, 0), 4)
            cv2.putText(vis, "STOP LINE (DETECTED)", (x1, y1 - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        else:
            cv2.putText(vis, "STOP LINE: NOT DETECTED", (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

        return vis