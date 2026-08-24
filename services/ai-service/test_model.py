# import os
# import math
# import cv2
# import numpy as np
# import matplotlib.pyplot as plt
# import keras
# from keras import Sequential
# from keras.layers import Conv2D, MaxPooling2D, Flatten, Dense, BatchNormalization, Dropout
# from keras.regularizers import l2
# from ultralytics import YOLO

# # ================== 1. CẤU HÌNH ĐƯỜNG DẪN & LOAD MODEL ==================
# # ================== 1. CẤU HÌNH ĐƯỜNG DẪN & LOAD MODEL ==================
# BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# MODELS_DIR = os.path.join(BASE_DIR, "models")

# char_width = 35
# char_height = 50
# num_class = 36

# def Build_VGG19():
#     model = Sequential()
    
#     # Block 1
#     model.add(Conv2D(64, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform', name='block1_conv1', input_shape=(char_height, char_width, 1)))
#     model.add(Conv2D(64, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform', name='block1_conv2'))
#     model.add(BatchNormalization())
#     model.add(MaxPooling2D(pool_size=(2,2), strides=(2,2), name='block1_maxpool'))

#     # Block 2
#     model.add(Conv2D(128, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform', name='block2_conv1'))
#     model.add(Conv2D(128, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform', name='block2_conv2'))
#     model.add(BatchNormalization())
#     model.add(MaxPooling2D(pool_size=(2,2), strides=(2,2), name='block2_maxpool'))

#     # Block 3
#     model.add(Conv2D(256, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform', name='block3_conv1'))
#     model.add(Conv2D(256, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform', name='block3_conv2'))
#     model.add(Conv2D(256, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform', name='block3_conv3'))
#     model.add(Conv2D(256, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform', name='block3_conv4'))
#     model.add(BatchNormalization())
#     model.add(MaxPooling2D(pool_size=(2,2), strides=(2,2), name='block3_maxpool'))

#     # Block 4
#     model.add(Conv2D(512, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform', name='block4_conv1'))
#     model.add(Conv2D(512, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform', name='block4_conv2'))
#     model.add(Conv2D(512, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform', name='block4_conv3'))
#     model.add(Conv2D(512, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform', name='block4_conv4'))
#     model.add(BatchNormalization())
#     model.add(MaxPooling2D(pool_size=(2,2), strides=(2,2), name='block4_maxpool'))

#     # Block 5
#     model.add(Conv2D(512, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform', name='block5_conv1'))
#     model.add(Conv2D(512, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform', name='block5_conv2'))
#     model.add(Conv2D(512, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform', name='block5_conv3'))
#     model.add(Conv2D(512, (3,3), activation="relu", padding="same", kernel_initializer='he_uniform', name='block5_conv4'))
#     model.add(BatchNormalization())
#     model.add(MaxPooling2D(pool_size=(2,2), strides=(2,2), name='block5_maxpool'))

#     # Classifier
#     model.add(Flatten())
#     model.add(Dense(4096, activation='relu', kernel_regularizer=l2(0.01)))
#     model.add(Dropout(0.5))
#     model.add(Dense(4096, activation='relu', kernel_regularizer=l2(0.01)))
#     model.add(Dropout(0.5))
#     model.add(Dense(num_class, activation='softmax'))

#     # Có thể giữ phần compile nếu bạn muốn, mặc dù khi test chỉ lấy weights để dự đoán thì không bắt buộc phải compile
#     model.compile(optimizer="adam", loss='sparse_categorical_crossentropy', metrics=['accuracy'])
#     return model

# # Khởi tạo VGG19 thay vì VGG16
# ReadChar_model = Build_VGG19()
# ReadChar_model.load_weights(os.path.join(MODELS_DIR, "VGG19Model_Final.h5"))
# DetectLP_model = YOLO(os.path.join(MODELS_DIR, "helmet_lp_best.pt"))
# print("[INFO] Đã nạp thành công mô hình!")

# # ================== 2. CÁC HÀM XỬ LÝ TỪ FILE OCR_TEST.IPYNB ==================

# class Preprocess:
#     @staticmethod
#     def preprocess(image):
#         imgGrayscale = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
#         imgThresh = cv2.adaptiveThreshold(imgGrayscale, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 19, 9)
#         return imgGrayscale, imgThresh

# def find_contours(dimensions, img, check):
#     w = char_width + 10
#     h = char_height + 10
#     cntrs, _ = cv2.findContours(img.copy(), cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
#     lower_width = dimensions[0]
#     upper_width = dimensions[1]
#     lower_height = dimensions[2]
#     upper_height = dimensions[3]
#     if check == 1:
#         cntrs = sorted(cntrs, key=cv2.contourArea, reverse=True)[:6]
#     else:
#         cntrs = sorted(cntrs, key=cv2.contourArea, reverse=True)[:5]
    
#     ii = cv2.imread('contour.jpg')
#     x_cntr_list = []
#     img_res = []
#     for cntr in cntrs:
#         intX, intY, intWidth, intHeight = cv2.boundingRect(cntr)
#         if intWidth > lower_width and intWidth < upper_width and intHeight > lower_height and intHeight < upper_height:
#             x_cntr_list.append(intX)
#             char_copy = np.zeros((h, w))
#             expand_x = 5
#             expand_y = 3
#             char = img[max(0, intY - expand_y):min(img.shape[0], intY + intHeight + expand_y), 
#                        max(0, intX - expand_x):min(img.shape[1], intX + intWidth + expand_x)]
#             char = cv2.resize(char, (w, h), interpolation=cv2.INTER_LINEAR)
#             if ii is not None:
#                 cv2.rectangle(ii, (intX, intY), (intWidth + intX, intY + intHeight), (50, 21, 200), 2)
#             char = cv2.subtract(255, char)
#             char_copy[0:h, 0:w] = char
#             img_res.append(char_copy)
            
#     indices = sorted(range(len(x_cntr_list)), key=lambda k: x_cntr_list[k])
#     img_res_copy = []
#     for idx in indices:
#         img_res_copy.append(img_res[idx])
#     return np.array(img_res_copy)

# def white_border(dilated_image):
#     white = (255, 255, 255)
#     thickness = 1
#     dilated_image = cv2.line(dilated_image, (0, 0), (dilated_image.shape[1], 0), color=white, thickness=thickness)
#     dilated_image = cv2.line(dilated_image, (dilated_image.shape[1], 0), (dilated_image.shape[1], dilated_image.shape[0]), color=white, thickness=thickness)
#     dilated_image = cv2.line(dilated_image, (dilated_image.shape[1], dilated_image.shape[0]), (0, dilated_image.shape[0]), color=white, thickness=thickness)
#     dilated_image = cv2.line(dilated_image, (0, dilated_image.shape[0]), (0, 0), color=white, thickness=thickness)
#     return dilated_image

# def segment_characters(image, check):
#     img = cv2.resize(image, (333, 75), interpolation=cv2.INTER_LINEAR)
#     kerel3 = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
#     thre_mor = cv2.morphologyEx(img, cv2.MORPH_DILATE, kerel3)
#     _, img_binary = cv2.threshold(thre_mor, 200, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
#     img_binary = white_border(img_binary)
#     LP_WIDTH = img_binary.shape[0] 
#     LP_HEIGHT = img_binary.shape[1] 
#     dimensions = [LP_WIDTH / 33, LP_WIDTH, LP_HEIGHT / 7, LP_HEIGHT]
#     cv2.imwrite('contour.jpg', img_binary)
#     char_list = find_contours(dimensions, img_binary, check)
#     return char_list

# def get_closer_plate(plate):
#     imgGrayscaleplate, imgThreshplate = Preprocess.preprocess(plate)
#     _, imgGrayscaleplate = cv2.threshold(imgGrayscaleplate, 200, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
#     dilated_image = cv2.dilate(imgGrayscaleplate, (3, 3))

#     img1 = dilated_image
#     contours, _ = cv2.findContours(dilated_image, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
#     contours = sorted(contours, key=cv2.contourArea, reverse=True)[:1]
#     screenCnt = []
#     for c in contours:
#         peri = cv2.arcLength(c, True)
#         approx = cv2.approxPolyDP(c, 0.06 * peri, True)
#         [x, y, w, h] = cv2.boundingRect(approx.copy())
#         if len(approx) == 4:
#             screenCnt.append(approx)

#         for sc in screenCnt:
#             (x1, y1) = sc[0, 0]
#             (x2, y2) = sc[1, 0]
#             (x3, y3) = sc[2, 0]
#             (x4, y4) = sc[3, 0]
#             array = [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
#             array.sort(reverse=True, key=lambda x: x[1])
#             (x1, y1) = array[0]
#             (x2, y2) = array[1]
#             doi = abs(y1 - y2)
#             ke = abs(x1 - x2)
#             angle = math.atan(doi / (ke + 1e-5)) * (180.0 / math.pi)

#             mask = np.zeros(imgGrayscaleplate.shape, np.uint8)
#             cv2.drawContours(mask, [sc], 0, 255, -1)
#             (x_idx, y_idx) = np.where(mask == 255)
#             if len(x_idx) > 0 and len(y_idx) > 0:
#                 topx, topy = np.min(x_idx), np.min(y_idx)
#                 bottomx, bottomy = np.max(x_idx), np.max(y_idx)

#                 roi = plate[topx:bottomx, topy:bottomy]
#                 imgThresh = imgThreshplate[topx:bottomx, topy:bottomy]
#                 ptPlateCenter = ((bottomy - topy) / 2, (bottomx - topx) / 2)

#                 rotationMatrix = cv2.getRotationMatrix2D(ptPlateCenter, -angle if x1 < x2 else angle, 1.0)
#                 imgThresh = cv2.warpAffine(imgThresh, rotationMatrix, (bottomy - topy, bottomx - topx))
#                 img1 = imgThresh
#     return img1

# def image_detect(model, path):
#     im = cv2.imread(path)
#     if im is None:
#         print(f"Không tìm thấy ảnh tại: {path}")
#         return []
        
#     results = model(path, conf=0.3)[0]
#     for r in results.boxes:
#         cls_name = results.names[int(r.cls[0])]
#         if cls_name in ["LP", "license_plate", "lp"]:
#             x0, y0, x1, y1 = map(int, r.xyxy[0].cpu().numpy())
#             plate = im[y0:y1, x0:x1]
#             plate = get_closer_plate(plate)
            
#             mid_h = int(plate.shape[0] / 2)
#             cropped_top = plate[0 : mid_h + 3, 0 : plate.shape[1]]
#             cropped_under = plate[mid_h - 3 : plate.shape[0]]
            
#             char1 = segment_characters(cropped_top, 0)
#             char2 = segment_characters(cropped_under, 1)
            
#             if len(char1) > 0 and len(char2) > 0:
#                 char = np.concatenate((char1, char2))
#             elif len(char1) > 0:
#                 char = char1
#             else:
#                 char = char2
#             return char
#     return []

# def to_digit(char):
#     """Ép ký tự chữ bị nhận diện nhầm về số tương ứng"""
#     dict_char_to_digit = {
#         'S': '5', 'G': '6', 'B': '6', 'Z': '2', 
#         'D': '0', 'O': '0', 'Q': '0', 'A': '4', 
#         'T': '1', 'I': '1', 'L': '1'
#     }
#     return dict_char_to_digit.get(char, char)

# def to_letter(char):
#     """Ép ký tự số bị nhận diện nhầm về chữ tương ứng"""
#     dict_digit_to_char = {
#         '5': 'S', '6': 'G', '8': 'B', '2': 'Z', '0': 'D', '1': 'I','9': 'S'
#     }
#     return dict_digit_to_char.get(char, char)

# def process_license_plate(license_plate):
#     # Loại bỏ các wrapper thừa nếu có
#     clean_chars = [str(ch).replace("np.str_('", "").replace("')", "").replace("'", "") for ch in license_plate]
    
#     if len(clean_chars) < 7:
#         return ''.join(clean_chars)

#     # Chia dòng 1 (4 ký tự đầu) và dòng 2 (phần còn lại)
#     raw_line1 = clean_chars[:4]
#     raw_line2 = clean_chars[4:]

#     # 1. Chuẩn hóa Dòng 1: [Số, Số, Chữ, Số/Chữ]
#     l1_c0 = to_digit(raw_line1[0])
#     l1_c1 = to_digit(raw_line1[1])
#     l1_c2 = to_letter(raw_line1[2]) if not raw_line1[2].isalpha() else raw_line1[2]
#     l1_c3 = raw_line1[3]
#     # Sửa trường hợp 3 bị nhận diện nhầm thành B
#     if l1_c3 == 'B':
#         l1_c3 = '3'

#     line1 = f"{l1_c0}{l1_c1}-{l1_c2}{l1_c3}"

#     # 2. Chuẩn hóa Dòng 2: Toàn bộ là SỐ
#     line2_digits = []
#     for ch in raw_line2:
#         d = to_digit(ch)
#         line2_digits.append(d)
#     line2 = ''.join(line2_digits)

#     # Ghép chuỗi hoàn chỉnh
#     full_lp = f"{line1}-{line2}"
    
#     print("\n================ KẾT QUẢ SAU HẬU XỬ LÝ ================")
#     print(f"Dòng 1: {line1}")
#     print(f"Dòng 2: {line2}")
#     print(f"Biển số hoàn chỉnh: {full_lp}")
#     print("========================================================")
#     return full_lp

# def recognition_by_path(model, chartest):
#     label_str = "0 1 2 3 4 5 6 7 8 9 A B C D E F G H I J K L M N O P Q R S T U V W X Y Z"
#     img_label = np.array(label_str.split())
#     res_list = []
#     for i in range(len(chartest)):
#         image_resize = cv2.resize(chartest[i], (char_width, char_height))
#         prep = model.predict(image_resize.reshape(1, char_height, char_width, 1), verbose=0)
#         predicted_class = np.argmax(prep)
#         predicted_label = img_label[predicted_class]
#         res_list.append(predicted_label)
#     print("Danh sách ký tự:", res_list)
#     process_license_plate(res_list)

# def show_char(chartest):
#     fig, axs = plt.subplots(nrows=1, ncols=len(chartest), figsize=(len(chartest)*2, 3))
#     if len(chartest) == 1:
#         axs = [axs]
#     for i in range(len(chartest)):
#         axs[i].imshow(chartest[i], cmap='gray')
#         axs[i].axis('off')
#     plt.show()

# # ================== 3. CHẠY KIỂM THỬ ==================
# if __name__ == "__main__":
#     image_path = os.path.join(BASE_DIR, "test.jpg")
#     chartest = image_detect(DetectLP_model, image_path)
#     print(f"Số ký tự tìm thấy: {len(chartest)}")
#     if len(chartest) > 0:
#         show_char(chartest)
#         recognition_by_path(ReadChar_model, chartest)


import os
import cv2
import matplotlib.pyplot as plt
from ultralytics import YOLO

# Import trực tiếp Class OCR xịn xò mà chúng ta vừa cập nhật
from core.ocr import LicensePlateOCR 

# ================== 1. CẤU HÌNH ĐƯỜNG DẪN ==================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")

# ================== 2. KHỞI TẠO MÔ HÌNH ==================
print("[INFO] Đang nạp mô hình YOLO nhận diện biển số...")
# Dùng model chuyên nhận diện biển số mà bạn vừa train (my_lp_model.pt)
DetectLP_model = YOLO(os.path.join(MODELS_DIR, "my_lp_model.pt")) 

print("[INFO] Đang nạp mô hình PaddleOCR...")
ReadChar_model = LicensePlateOCR()
print("[INFO] Đã nạp thành công tất cả mô hình!")

# ================== 3. HÀM CHẠY KIỂM THỬ ==================
def test_single_image(image_path):
    if not os.path.exists(image_path):
        print(f"[LỖI] Không tìm thấy ảnh tại: {image_path}")
        return

    # Đọc ảnh
    img = cv2.imread(image_path)
    if img is None:
        print("[LỖI] Không thể đọc ảnh.")
        return

    # 1. Nhận diện vùng biển số bằng YOLO
    results = DetectLP_model(img, conf=0.45)[0]
    
    lp_crops = []
    for box in results.boxes:
        # Lấy tọa độ bounding box
        x1, y1, x2, y2 = map(int, box.xyxy[0].cpu().numpy())
        
        # Cắt ảnh biển số (mở rộng thêm padding 5 pixel để OCR dễ đọc hơn)
        pad = 5
        h, w = img.shape[:2]
        crop_x1, crop_y1 = max(0, x1 - pad), max(0, y1 - pad)
        crop_x2, crop_y2 = min(w, x2 + pad), min(h, y2 + pad)
        
        lp_crop = img[crop_y1:crop_y2, crop_x1:crop_x2]
        lp_crops.append(lp_crop)

    print(f"\n[KẾT QUẢ] Tìm thấy {len(lp_crops)} biển số trong ảnh.")

    # 2. Đọc chữ bằng PaddleOCR và hiển thị
    for i, crop in enumerate(lp_crops):
        if crop.size == 0:
            continue
            
        # Gọi hàm read_plate từ core.ocr (Hứng cả Text và Confidence)
        plate_text, confidence = ReadChar_model.read_plate(crop)
        
        print("=" * 50)
        print(f"Biển số {i+1}:")
        print(f"-> Chuỗi nhận diện : {plate_text if plate_text else 'KHÔNG ĐỌC ĐƯỢC'}")
        print(f"-> Độ tự tin (OCR): {confidence:.2f}")
        print("=" * 50)

        # Hiển thị ảnh crop bằng matplotlib
        crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        plt.figure(figsize=(5, 3))
        plt.imshow(crop_rgb)
        plt.title(f"Kết quả: {plate_text} ({confidence:.2f})")
        plt.axis('off')
        plt.show()

if __name__ == "__main__":
    test_img_path = os.path.join(BASE_DIR, "test.jpg")
    test_single_image(test_img_path)