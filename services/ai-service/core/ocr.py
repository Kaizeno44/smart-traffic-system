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
    TARGET_MIN_HEIGHT = 128

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
        Trả về biển số đã format (có dấu gạch), hoặc None.
        Thử cấu trúc theo thứ tự ưu tiên để tránh regex greedy cướp số của tail.
        """
        if not (7 <= len(raw) <= 9):
            return None

        c = list(raw)

        # Fix 'I' thừa ở vị trí 3
        if len(c) >= 4 and c[2] == 'I' and c[3].isalpha() and c[3] != 'I':
            del c[2]

        # Mã tỉnh → số
        for i in (0, 1):
            c[i] = self.CHAR_TO_DIGIT.get(c[i], c[i])

        # Series bắt đầu → chữ
        c[2] = self.DIGIT_TO_CHAR.get(c[2], c[2])

        # Ưu tiên: series toàn chữ + tail dài (biển mới VN)
        # (n_letters, has_digit_in_series, tail_len)
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
            series_total = n_letters + has_digit
            idx = 2 + series_total
            if idx + tail_len != len(c):
                continue
                
            cand = c.copy()
            for i in range(2, 2 + n_letters):
                cand[i] = self.DIGIT_TO_CHAR.get(cand[i], cand[i])
            if has_digit:
                cand[2 + n_letters] = self.CHAR_TO_DIGIT.get(
                    cand[2 + n_letters], cand[2 + n_letters])
            for i in range(idx, len(cand)):
                cand[i] = self.CHAR_TO_DIGIT.get(cand[i], cand[i])
                
            city = "".join(cand[:2])
            letters = "".join(cand[2:2 + n_letters])
            series_digit = ("".join(cand[2 + n_letters:2 + series_total])
                            if has_digit else "")
            tail = "".join(cand[2 + series_total:])
            
            # Verify bằng tay — không dùng regex ambiguous nữa
            if (city.isdigit()
                    and letters.isalpha()
                    and (not has_digit or series_digit.isdigit())
                    and tail.isdigit()
                    and len(tail) == tail_len):
                return f"{city}{letters}{series_digit}-{tail}"

        return None

    def correct_and_format_plate(self, text: str) -> str:
        """Chuẩn hoá biển số về dạng '81AR-01082'."""
        raw = re.sub(r'[^A-Z0-9]', '', text.upper())
        if not raw:
            return ""

        fixed = self._fix_positions(raw)
        return fixed if fixed else raw

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

    def _extract_plate_from_items(self, items: List[Dict]) -> Tuple[str, float]:
        if not items:
            return "", 0.0
        rows = self._group_rows(items)
        parts, confs = [], []
        for row in rows:
            row.sort(key=lambda x: x["cx"])
            parts.append("".join(x["text"] for x in row))
            confs.extend(x["conf"] for x in row)
        raw_combined = "".join(parts).replace(".", "").replace(" ", "").replace(",", "")
        plate = self.correct_and_format_plate(raw_combined)
        avg_conf = float(np.mean(confs)) if confs else 0.0
        return plate, avg_conf

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

