import re
import cv2
import logging
import numpy as np
from typing import Optional, Tuple, List, Dict

from paddleocr import PaddleOCR

logging.getLogger('ppocr').setLevel(logging.ERROR)
logger = logging.getLogger(__name__)


class LicensePlateOCR:
    """OCR biển số xe VN — PaddleOCR 2.7.3 + heuristic sửa lỗi."""

    CHAR_TO_DIGIT = {'O': '0', 'D': '0', 'Q': '0', 'I': '1', 'L': '1',
                     'S': '5', 'B': '8', 'G': '6', 'Z': '2', 'A': '4'}
    DIGIT_TO_CHAR = {'0': 'D', '1': 'I', '5': 'S', '8': 'B',
                     '6': 'G', '2': 'Z', '4': 'A'}
    # Regex chuẩn biển VN: 2 số + 1-2 chữ (+1 số) + 4-5 số
    PLATE_REGEX = re.compile(r'^(\d{2})([A-Z]{1,2}\d?)(\d{4,5})$')

    # Ngưỡng resize tối thiểu — ảnh nhỏ hơn sẽ được phóng to
    TARGET_MIN_HEIGHT = 96

    def __init__(self, use_gpu: bool = False):
        try:
            self.ocr = PaddleOCR(
                lang='en',
                use_angle_cls=True,
                show_log=False,
                use_gpu=use_gpu,
                enable_mkldnn=False,   # tránh bug oneDNN trên CPU
            )
            logger.info(f"[OCR Init] PaddleOCR 2.x (device={'gpu' if use_gpu else 'cpu'})")
        except Exception as e:
            logger.warning(f"[OCR Init] Fallback: {e}")
            self.ocr = PaddleOCR(lang='en', show_log=False, enable_mkldnn=False)

    # ---------- TIỀN XỬ LÝ ----------
    @staticmethod
    def preprocess_image(img: np.ndarray) -> np.ndarray:
        """
        Resize + CLAHE. Nâng ngưỡng resize lên 96px để xử lý ảnh nhỏ tốt hơn
        (ảnh biển số crop từ video thường chỉ 60-80px chiều cao).
        """
        if img is None or img.size == 0:
            return img

        # Chuẩn hoá về BGR
        if img.ndim == 2:
            img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
        elif img.shape[2] == 4:
            img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)

        h, w = img.shape[:2]
        if h < LicensePlateOCR.TARGET_MIN_HEIGHT:
            scale = LicensePlateOCR.TARGET_MIN_HEIGHT / h
            new_w = int(w * scale)
            new_h = LicensePlateOCR.TARGET_MIN_HEIGHT
            img = cv2.resize(img, (new_w, new_h),
                             interpolation=cv2.INTER_CUBIC)

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        return cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)

    # ---------- SỬA LỖI VỊ TRÍ ----------
    def _fix_positions(self, raw: str) -> Optional[str]:
        """
        Ép ký tự theo vị trí chuẩn biển VN:
        - 2 ký tự đầu = mã tỉnh (số)
        - Ký tự 3-4 = series (chữ, có thể + 1 số)
        - 4-5 ký tự cuối = số thứ tự (số)
        """
        if not (7 <= len(raw) <= 9):
            return None

        c = list(raw)

        # --- FIX LỖI QUANG HỌC ĐẶC BIỆT ---
        # 1. Bỏ 'I' thừa ở vị trí 3 khi tiếp theo là chữ cái khác
        #    VD: '77IN91266' → '77N91266' (I đọc nhầm từ N/1)
        if len(c) >= 4 and c[2] == 'I' and c[3].isalpha() and c[3] != 'I':
            del c[2]

        # 2. Bỏ 'I' thừa khi nó nằm giữa 2 chữ số (VD: '5011234' → '501234')
        #    nhưng chỉ khi số lượng ký tự > 7 (không cần thiết)

        # --- Ép ký tự theo vị trí ---
        # Mã tỉnh (2 ký tự đầu) → số
        for i in (0, 1):
            c[i] = self.CHAR_TO_DIGIT.get(c[i], c[i])

        # Series bắt đầu (ký tự 3) → chữ
        c[2] = self.DIGIT_TO_CHAR.get(c[2], c[2])

        # Thử series 1 chữ (51G) rồi 2 chữ (51LD)
        for series_len in (1, 2):
            idx = 2 + series_len
            if idx > len(c) - 4:
                continue
            cand = c.copy()
            # Series → chữ
            for i in range(2, idx):
                cand[i] = self.DIGIT_TO_CHAR.get(cand[i], cand[i])
            # Tail → số
            for i in range(idx, len(cand)):
                cand[i] = self.CHAR_TO_DIGIT.get(cand[i], cand[i])
            s = "".join(cand)
            if self.PLATE_REGEX.match(s):
                return s
        return None

    def correct_and_format_plate(self, text: str) -> str:
        """
        Chuẩn hoá biển số về dạng '50A4-11633' (nhất quán với main.py).
        Ví dụ: '50-A4 116.33' → '50A4-11633'
        """
        raw = re.sub(r'[^A-Z0-9]', '', text.upper())
        if not raw:
            return ""

        fixed = self._fix_positions(raw)
        if not fixed:
            return raw

        m = self.PLATE_REGEX.match(fixed)
        if not m:
            return fixed

        city, series, tail = m.groups()
        return f"{city}{series}-{tail}"

    # ---------- OCR ----------
    def _run_ocr(self, img: np.ndarray) -> List[Dict]:
        try:
            try:
                results = self.ocr.ocr(img)
            except TypeError:
                results = self.ocr.ocr(img, cls=True)
        except Exception as e:
            logger.error(f"[OCR] run failed: {e}")
            return []

        if not results or results[0] is None:
            return []

        items = []
        for det in results[0]:
            if isinstance(det, dict):
                box = det.get('rec_polys') or det.get('dt_polys')
                text = det.get('text', '')
                conf = float(det.get('confidence', det.get('score', 0.0)))
            else:
                box, (text, conf) = det[0], det[1]
                conf = float(conf)
            if not box or not text:
                continue
            xs = [p[0] for p in box]
            ys = [p[1] for p in box]
            items.append({
                "cx": sum(xs) / len(xs),
                "cy": sum(ys) / len(ys),
                "height": max(ys) - min(ys),
                "text": text,
                "conf": conf,
            })
        return items

    @staticmethod
    def _group_rows(items: List[Dict], y_ratio: float = 0.6) -> List[List[Dict]]:
        """Nhóm text box thành các dòng theo trục Y (dùng median height)."""
        if not items:
            return []
        items = sorted(items, key=lambda x: x["cy"])
        median_h = float(np.median([it["height"] for it in items]))
        rows, current = [], [items[0]]
        for it in items[1:]:
            if abs(it["cy"] - current[-1]["cy"]) < median_h * y_ratio:
                current.append(it)
            else:
                rows.append(current)
                current = [it]
        rows.append(current)
        return rows

    # def _extract_plate_from_items(self, items: List[Dict]) -> Tuple[str, float]:
    #     if not items:
    #         return "", 0.0
            
    #     rows = self._group_rows(items)
    #     confs = [x["conf"] for x in items]
    #     avg_conf = float(np.mean(confs)) if confs else 0.0
    #     # Sắp xếp các phần tử trong mỗi dòng từ trái qua phải theo cx
    #     sorted_rows_text = []
    #     for row in rows:
    #         row.sort(key=lambda x: x["cx"])
    #         sorted_rows_text.append("".join(x["text"] for x in row))
    #     # TRƯỜNG HỢP BIỂN 2 DÒNG (Đặc trưng biển xe máy Việt Nam)
    #     if len(rows) == 2:
    #         top_raw = sorted_rows_text[0]
    #         bottom_raw = sorted_rows_text[1]
    #         top_fixed = self._fix_top_line(top_raw)
    #         bottom_fixed = self._fix_bottom_line(bottom_raw)
    #         # Nếu cả 2 dòng chuẩn dạng: top có >=3 ký tự và bottom có 4-5 số
    #         if len(top_fixed) >= 3 and 4 <= len(bottom_fixed) <= 5:
    #             plate = f"{top_fixed}-{bottom_fixed}"
    #             return plate, avg_conf
    #     # TRƯỜNG HỢP BIỂN 1 DÒNG (HOẶC > 2 BOX BỊ TÁCH RỜI) -> Fallback sang correct_and_format_plate
    #     full_text = "".join(sorted_rows_text)
    #     plate = self.correct_and_format_plate(full_text)
    #     return plate, avg_conf

    # ---------- PIPELINE ----------
    def read_plate(self, crop_image: np.ndarray,
                   conf_threshold: float = 0.80) -> Tuple[str, float]:
        """
        Đọc biển số từ ảnh crop.
        - Thử ảnh gốc trước, nếu conf thấp → thử ảnh CLAHE
        - Trả về (biển_số_format, confidence)
        """
        if crop_image is None or crop_image.size == 0:
            return "", 0.0

        # 1. Ảnh gốc (thêm viền trắng an toàn tránh mất số mép trái/phải)
        bordered_orig = cv2.copyMakeBorder(crop_image, 15, 15, 15, 15, cv2.BORDER_CONSTANT, value=[255, 255, 255])
        items_orig = self._run_ocr(bordered_orig)
        plate_orig, conf_orig = self._extract_plate_from_items(items_orig)

        # Early stop nếu ảnh gốc đã tốt
        if plate_orig and "-" in plate_orig and conf_orig >= conf_threshold:
            return plate_orig, conf_orig

        # 2. Ảnh CLAHE
        items_proc = self._run_ocr(self.preprocess_image(crop_image))
        plate_proc, conf_proc = self._extract_plate_from_items(items_proc)

        orig_valid = bool(plate_orig) and "-" in plate_orig
        proc_valid = bool(plate_proc) and "-" in plate_proc

        # Ưu tiên format hợp lệ
        if orig_valid and not proc_valid:
            return plate_orig, conf_orig
        if proc_valid and not orig_valid:
            return plate_proc, conf_proc
        # Cùng valid → chọn conf cao hơn
        if conf_proc > conf_orig:
            return plate_proc, conf_proc
        return plate_orig, conf_orig
    def _fix_top_line(self, text: str) -> str:
        """
        Chuẩn hoá dòng 1 (Tỉnh + Series):
        VD: '81-AR' -> '81AR', '59-X3' -> '59X3'
        - 2 ký tự đầu: số
        - Ký tự 3: chữ cái
        - Ký tự 4 (nếu có): chữ cái hoặc số
        """
        raw = re.sub(r'[^A-Z0-9]', '', text.upper())
        if len(raw) < 3:
            return raw
        c = list(raw)
        # 2 ký tự đầu là số tỉnh
        for i in (0, 1):
            c[i] = self.CHAR_TO_DIGIT.get(c[i], c[i])
        # Ký tự 3 là chữ series (A-Z)
        c[2] = self.DIGIT_TO_CHAR.get(c[2], c[2])
        # Dòng trên của biển 2 dòng xe máy không bao giờ vượt quá 4 ký tự!
        return "".join(c[:4])

    def _fix_bottom_line(self, text: str) -> str:
        """
        Chuẩn hoá dòng 2 (4 hoặc 5 số):
        VD: '010.82' -> '01082', 'O1O82' -> '01082'
        """
        raw = re.sub(r'[^A-Z0-9]', '', text.upper())
        # Chuyển các chữ cái hay nhận nhầm thành số
        c = [self.CHAR_TO_DIGIT.get(ch, ch) for ch in raw]
        digits = "".join(ch for ch in c if ch.isdigit())
        # Nếu dài hơn 5 chữ số do rác viền, lấy 5 chữ số hợp lý nhất
        if len(digits) > 5:
            digits = digits[:5]
        return digits

    def _extract_plate_from_items(self, items: List[Dict], img_h: int = 0) -> Tuple[str, float]:
        if not items:
            return "", 0.0

        confs = [x["conf"] for x in items]
        avg_conf = float(np.mean(confs)) if confs else 0.0

        # Nếu ảnh vuông/chữ nhật đứng (biển 2 dòng) hoặc có box ở trên và dưới
        # Phân dòng theo toạ độ cy: dòng trên có cy < cy_mid, dòng dưới có cy >= cy_mid
        min_y = min(it["cy"] for it in items)
        max_y = max(it["cy"] for it in items)

        # Nếu độ chênh lệch Y giữa các box lớn (> 20px) -> Chắc chắn là biển 2 dòng
        if (max_y - min_y) >= 15:
            mid_y = (min_y + max_y) / 2.0
            top_items = sorted([it for it in items if it["cy"] < mid_y], key=lambda x: x["cx"])
            bottom_items = sorted([it for it in items if it["cy"] >= mid_y], key=lambda x: x["cx"])

            top_raw = "".join(x["text"] for x in top_items)
            bottom_raw = "".join(x["text"] for x in bottom_items)

            top_fixed = self._fix_top_line(top_raw)
            bottom_fixed = self._fix_bottom_line(bottom_raw)

            if len(top_fixed) >= 3 and 4 <= len(bottom_fixed) <= 5:
                return f"{top_fixed}-{bottom_fixed}", avg_conf

        # Fallback với biển 1 dòng (dài)
        items_sorted = sorted(items, key=lambda x: x["cx"])
        full_text = "".join(x["text"] for x in items_sorted)
        plate = self.correct_and_format_plate(full_text)
        return plate, avg_conf

