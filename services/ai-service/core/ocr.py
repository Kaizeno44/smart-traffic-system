# import os
# import math
# import cv2
# import numpy as np
# import keras
# from keras import Sequential
# from keras.layers import Conv2D, MaxPooling2D, Flatten, Dense, BatchNormalization, Dropout
# from keras.regularizers import l2

# CHAR_WIDTH = 35
# CHAR_HEIGHT = 50
# NUM_CLASS = 36
# LABEL_STR = "0 1 2 3 4 5 6 7 8 9 A B C D E F G H I J K L M N O P Q R S T U V W X Y Z"
# IMG_LABELS = np.array(LABEL_STR.split())

# def build_vgg19():
#     model = Sequential()
    
#     # Block 1
#     model.add(Conv2D(64, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform', input_shape=(CHAR_HEIGHT, CHAR_WIDTH, 1)))
#     model.add(Conv2D(64, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform'))
#     model.add(BatchNormalization())
#     model.add(MaxPooling2D(pool_size=(2,2), strides=(2,2)))

#     # Block 2
#     model.add(Conv2D(128, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform'))
#     model.add(Conv2D(128, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform'))
#     model.add(BatchNormalization())
#     model.add(MaxPooling2D(pool_size=(2,2), strides=(2,2)))

#     # Block 3 (4 lớp Conv)
#     model.add(Conv2D(256, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform'))
#     model.add(Conv2D(256, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform'))
#     model.add(Conv2D(256, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform'))
#     model.add(Conv2D(256, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform'))
#     model.add(BatchNormalization())
#     model.add(MaxPooling2D(pool_size=(2,2), strides=(2,2)))

#     # Block 4 (4 lớp Conv)
#     model.add(Conv2D(512, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform'))
#     model.add(Conv2D(512, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform'))
#     model.add(Conv2D(512, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform'))
#     model.add(Conv2D(512, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform'))
#     model.add(BatchNormalization())
#     model.add(MaxPooling2D(pool_size=(2,2), strides=(2,2)))

#     # Block 5 (4 lớp Conv)
#     model.add(Conv2D(512, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform'))
#     model.add(Conv2D(512, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform'))
#     model.add(Conv2D(512, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform'))
#     model.add(Conv2D(512, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform'))
#     model.add(BatchNormalization())
#     model.add(MaxPooling2D(pool_size=(2,2), strides=(2,2)))

#     # Classifier
#     model.add(Flatten())
#     model.add(Dense(4096, activation='relu', kernel_regularizer=l2(0.01)))
#     model.add(Dropout(0.5))
#     model.add(Dense(4096, activation='relu', kernel_regularizer=l2(0.01)))
#     model.add(Dropout(0.5))
#     model.add(Dense(NUM_CLASS, activation='softmax'))
    
#     return model
# def maximize_contrast(img_gray):
#     clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
#     return clahe.apply(img_gray)

# def preprocess_line(img_line):
#     img = cv2.resize(img_line, (333, 75), interpolation=cv2.INTER_CUBIC)
#     if len(img.shape) == 3:
#         img_gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
#     else:
#         img_gray = img.copy()
        
#     img_gray = maximize_contrast(img_gray)
#     img_blurred = cv2.GaussianBlur(img_gray, (3, 3), 0)
#     # Không dùng MORPH_DILATE mạnh gây bít lỗ 3->8, 6->8, 7->1
#     img_thresh = cv2.adaptiveThreshold(img_blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 17, 7)
#     return img_thresh

# def extract_chars_from_line(img_binary, max_chars=5):
#     LP_HEIGHT, LP_WIDTH = img_binary.shape[0], img_binary.shape[1]
#     cntrs, _ = cv2.findContours(img_binary.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
#     valid_cntrs = []
#     for cntr in cntrs:
#         intX, intY, intWidth, intHeight = cv2.boundingRect(cntr)
#         aspect_ratio = intHeight / float(intWidth + 1e-5)
#         if 0.20 * LP_HEIGHT < intHeight < 0.95 * LP_HEIGHT and 0.03 * LP_WIDTH < intWidth < 0.45 * LP_WIDTH:
#             if 0.5 <= aspect_ratio <= 6.0:
#                 valid_cntrs.append(cntr)
                
#     valid_cntrs = sorted(valid_cntrs, key=cv2.contourArea, reverse=True)[:max_chars]
    
#     line_chars = []
#     for cntr in valid_cntrs:
#         intX, intY, intWidth, intHeight = cv2.boundingRect(cntr)
#         expand_x, expand_y = 3, 2
#         char_crop = img_binary[max(0, intY - expand_y):min(LP_HEIGHT, intY + intHeight + expand_y), 
#                                max(0, intX - expand_x):min(LP_WIDTH, intX + intWidth + expand_x)]
#         if char_crop.size > 0:
#             char_resized = cv2.resize(char_crop, (CHAR_WIDTH, CHAR_HEIGHT), interpolation=cv2.INTER_LINEAR)
#             char_inverted = cv2.subtract(255, char_resized).astype("float32")
#             line_chars.append((intX, char_inverted))
            
#     line_chars.sort(key=lambda item: item[0])
#     return [c[1] for c in line_chars]

# def segment_characters_two_lines(plate_img):
#     if plate_img is None or plate_img.size == 0:
#         return [], []
        
#     h_plate = plate_img.shape[0]
#     mid_h = int(h_plate / 2)
    
#     top_crop = plate_img[0 : mid_h + 5, :]
#     bot_crop = plate_img[max(0, mid_h - 5) : h_plate, :]
    
#     top_binary = preprocess_line(top_crop)
#     bot_binary = preprocess_line(bot_crop)
    
#     top_chars = extract_chars_from_line(top_binary, max_chars=4)
#     bot_chars = extract_chars_from_line(bot_binary, max_chars=5)
    
#     return top_chars, bot_chars

# def refine_digit_by_geometry(char_img_inverted, pred_digit, probs):
#     """
#     Sửa lỗi nhầm lẫn chữ số bằng hình học vùng nét:
#     - 5 nhầm thành 6 (hoặc 6 nhầm thành 5)
#     - 1 nhầm thành 7 (hoặc 7 nhầm thành 1)
#     - 6 nhầm thành 8
#     """
#     bin_img = (char_img_inverted < 128).astype(np.uint8)
#     h, w = bin_img.shape
    
#     top_row = bin_img[0:int(h * 0.20), :]
#     top_density = np.mean(top_row)
    
#     left_mid = bin_img[int(h * 0.25):int(h * 0.60), 0:int(w * 0.38)]
#     left_mid_density = np.mean(left_mid)
    
#     top_right = bin_img[0:int(h * 0.38), int(w * 0.50):w]
#     top_right_density = np.mean(top_right)
    
#     top_left = bin_img[0:int(h * 0.38), 0:int(w * 0.45)]
#     top_left_density = np.mean(top_left)
    
#     mid_row = bin_img[int(h * 0.40):int(h * 0.65), :]
#     mid_density = np.mean(mid_row)

#     # 1. Sửa lỗi số 6 bị nhầm thành 8 (khi pred_digit == '8')
#     if pred_digit == '8':
#         # Số 8 phải kín nét ở cả 4 góc. Nếu góc trên bên phải hở nét (< 0.20) -> Không thể là 8!
#         if top_right_density < 0.20:
#             if left_mid_density < 0.12:
#                 return '3'
#             elif top_left_density > 0.20 or probs[5] > probs[6]:
#                 return '5'
#             else:
#                 return '6'

#     # 2. Sửa lỗi số 5 bị nhầm thành 6 (khi pred_digit == '6')
#     if pred_digit == '6':
#         if left_mid_density < 0.12:
#             return '3'
#         if top_left_density > 0.18 and top_right_density < 0.20:
#             return '5'
#         if probs[5] > probs[6] * 0.7:
#             return '5'

#     # 3. Sửa lỗi số 1 bị nhầm thành 7 (và số 7 bị nhầm thành 1)
#     if pred_digit == '1':
#         # Chỉ chuyển thành 7 khi CÓ THANH NGANG RỘNG RÕ RÀNG ở đỉnh trên cùng (> 0.32 density)
#         if top_density > 0.32:
#             return '7'
            
#     if pred_digit == '7':
#         # Nếu đỉnh trên cùng hẹp (< 0.18 density) -> Sửa về số 1
#         if top_density < 0.18:
#             return '1'
#         if left_mid_density > 0.22 and mid_density > 0.22:
#             return '4'

#     # 4. Sửa lỗi số 0 bị nhầm thành 6
#     if pred_digit == '0':
#         if top_right_density < 0.12 and top_left_density > 0.18:
#             return '6'

#     return pred_digit

# CHAR_TO_DIGIT_MAP = {
#     'S': '5', 'G': '6', 'B': '8', 'Z': '2', 
#     'D': '0', 'O': '0', 'Q': '0', 'A': '4', 
#     'T': '1', 'I': '1', 'L': '1', 'P': '9', 'R': '9', 'E': '6'
# }

# DIGIT_TO_CHAR_MAP = {
#     '5': 'S', '6': 'G', '8': 'B', '2': 'Z', '0': 'D', '1': 'I', '9': 'P', '4': 'A'
# }

# def decode_char_by_constraint(probabilities, ch_img=None, is_digit=True):
#     probs = probabilities[0]
#     top_idx = np.argmax(probs)
#     top_char = IMG_LABELS[top_idx]
    
#     if is_digit:
#         digit_res = top_char
#         if not top_char.isdigit():
#             if top_char in CHAR_TO_DIGIT_MAP:
#                 digit_res = CHAR_TO_DIGIT_MAP[top_char]
#             else:
#                 best_digit_idx = np.argmax(probs[:10])
#                 digit_res = IMG_LABELS[best_digit_idx]
                
#         if ch_img is not None:
#             digit_res = refine_digit_by_geometry(ch_img, digit_res, probs)
#         return digit_res
#     else:
#         if not top_char.isdigit():
#             return top_char
#         elif top_char in DIGIT_TO_CHAR_MAP:
#             return DIGIT_TO_CHAR_MAP[top_char]
#         else:
#             best_char_idx = 10 + np.argmax(probs[10:])
#             return IMG_LABELS[best_char_idx]

# def read_license_plate(model, plate_img):
#     if plate_img is None or plate_img.size == 0:
#         return ""
        
#     top_chars, bot_chars = segment_characters_two_lines(plate_img)
    
#     if not top_chars and not bot_chars:
#         return ""

#     # Nhận diện dòng 1 (Tối đa 4 ký tự: Mã tỉnh + Sê-ri)
#     pred_line1 = []
#     for idx, ch_img in enumerate(top_chars):
#         ch_input = ch_img.reshape(1, CHAR_HEIGHT, CHAR_WIDTH, 1)
#         prep = model.predict(ch_input, verbose=0)
#         probs = prep[0]
        
#         if len(top_chars) == 4:
#             if idx in [0, 1]:
#                 pred_line1.append(decode_char_by_constraint(prep, ch_img=ch_img, is_digit=True))
#             elif idx == 2:
#                 pred_line1.append(decode_char_by_constraint(prep, ch_img=ch_img, is_digit=False))
#             elif idx == 3:
#                 top_char = IMG_LABELS[np.argmax(probs)]
#                 if top_char.isdigit() or top_char in CHAR_TO_DIGIT_MAP:
#                     pred_line1.append(decode_char_by_constraint(prep, ch_img=ch_img, is_digit=True))
#                 else:
#                     pred_line1.append(decode_char_by_constraint(prep, ch_img=ch_img, is_digit=False))
#         elif len(top_chars) == 3:
#             if idx in [0, 1]:
#                 pred_line1.append(decode_char_by_constraint(prep, ch_img=ch_img, is_digit=True))
#             else:
#                 pred_line1.append(decode_char_by_constraint(prep, ch_img=ch_img, is_digit=False))
#         else:
#             pred_line1.append(IMG_LABELS[np.argmax(probs)])
            
#     # Nhận diện dòng 2 (Tối đa 5 ký tự: Bắt buộc 100% SỐ)
#     pred_line2 = []
#     for ch_img in bot_chars:
#         ch_input = ch_img.reshape(1, CHAR_HEIGHT, CHAR_WIDTH, 1)
#         prep = model.predict(ch_input, verbose=0)
#         pred_line2.append(decode_char_by_constraint(prep, ch_img=ch_img, is_digit=True))
        
#     line1_str = "".join(pred_line1)
#     line2_str = "".join(pred_line2)
    
#     if line1_str and line2_str:
#         if len(line1_str) >= 4:
#             line1_fmt = f"{line1_str[:2]}-{line1_str[2:]}"
#         else:
#             line1_fmt = line1_str
            
#         if len(line2_str) == 5:
#             line2_fmt = f"{line2_str[:3]}.{line2_str[3:]}"
#         else:
#             line2_fmt = line2_str
            
#         return f"{line1_fmt} {line2_fmt}"
#     return line1_str or line2_str

import os
import re
import cv2
import numpy as np
from paddleocr import PaddleOCR

class LicensePlateOCR:
    def __init__(self):
        # Khởi tạo PaddleOCR ưu tiên đọc tiếng Anh (chuẩn nhất cho biển số)
        try:
            self.ocr = PaddleOCR(lang='en', use_textline_orientation=True, enable_mkldnn=False)
        except Exception:
            try:
                self.ocr = PaddleOCR(lang='en', use_angle_cls=True, enable_mkldnn=False)
            except Exception:
                self.ocr = PaddleOCR(lang='en')

    def format_plate_text(self, text):
        text = re.sub(r'[^A-Z0-9\-\.]', '', text.upper())
        if re.match(r'^\d{2}[A-Z]{1,2}\d{0,1}\-\d{3,4}(\.\d{2})?$', text):
            return text
            
        raw = re.sub(r'[\-\.]', '', text)
        raw = self.correct_confusion_characters(raw)
        
        match = re.match(r'^(\d{2})([A-Z]{1,2}\d{0,1})(\d{3,5})$', raw)
        if match:
            city_code = match.group(1)
            series = match.group(2)
            numbers = match.group(3)
            if len(numbers) == 5:
                numbers = f"{numbers[:3]}.{numbers[3:]}"
            return f"{city_code}{series}-{numbers}"
            
        return text

    def correct_confusion_characters(self, raw):
        chars = list(raw)
        n = len(chars)
        if n < 5:
            return raw
            
        char_to_digit = {
            'O': '0', 'D': '0', 'Q': '0', 
            'I': '1', 'L': '1', 
            'S': '5', 'B': '8', 
            'G': '6', 'Z': '2', 'A': '4'
        }
        
        for i in range(2):
            if chars[i].isalpha() and chars[i] in char_to_digit:
                chars[i] = char_to_digit[chars[i]]
                
        for i in range(n - 1, 2, -1):
            if chars[i].isalpha():
                if chars[i] in char_to_digit:
                    chars[i] = char_to_digit[chars[i]]
                else:
                    break 
                    
        return "".join(chars)

    def read_plate(self, crop_image):
        if crop_image is None or crop_image.size == 0:
            return "", 0.0

        try:
            results = self.ocr.ocr(crop_image)
        except TypeError:
            results = self.ocr.ocr(crop_image, cls=True)
        
        if not results or results[0] is None:
            return "", 0.0

        items = []
        if isinstance(results[0], dict):
            res_dict = results[0]
            rec_texts = res_dict.get('rec_texts', [])
            rec_scores = res_dict.get('rec_scores', [])
            rec_polys = res_dict.get('rec_polys', [])
            
            for i in range(len(rec_texts)):
                text = rec_texts[i]
                conf = rec_scores[i]
                box = rec_polys[i] if i < len(rec_polys) else None
                if box is None or len(box) == 0:
                    continue
                
                xs = [pt[0] for pt in box]
                ys = [pt[1] for pt in box]
                cx = sum(xs) / len(xs)
                cy = sum(ys) / len(ys)
                height = max(ys) - min(ys)
                
                items.append({"cx": cx, "cy": cy, "height": height, "text": text, "confidence": conf})
        else:
            detections = results[0]
            for det in detections:
                box = det[0]
                text = det[1][0]
                conf = det[1][1]
                
                xs = [pt[0] for pt in box]
                ys = [pt[1] for pt in box]
                cx = sum(xs) / len(xs)
                cy = sum(ys) / len(ys)
                height = max(ys) - min(ys)
                
                items.append({"cx": cx, "cy": cy, "height": height, "text": text, "confidence": conf})

        items.sort(key=lambda x: x["cy"])
        
        rows = []
        if items:
            current_row = [items[0]]
            avg_height = items[0]["height"]
            
            for item in items[1:]:
                if abs(item["cy"] - current_row[-1]["cy"]) < (avg_height * 0.6):
                    current_row.append(item)
                    avg_height = sum(x["height"] for x in current_row) / len(current_row)
                else:
                    rows.append(current_row)
                    current_row = [item]
                    avg_height = item["height"]
            rows.append(current_row)

        final_text_parts = []
        confidences = []
        
        for row in rows:
            row.sort(key=lambda x: x["cx"])
            row_text = "".join(x["text"] for x in row)
            final_text_parts.append(row_text)
            confidences.extend([x["confidence"] for x in row])

        combined_text = "".join(final_text_parts)
        formatted_text = self.format_plate_text(combined_text)
        
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
        return formatted_text, avg_confidence