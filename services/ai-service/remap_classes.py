import os
import glob

# Nhắm mục tiêu vào 3 thư mục của bộ Helmet
label_folders = [
    "temp_helmet_lp/train/labels",
    "temp_helmet_lp/valid/labels",
    "temp_helmet_lp/test/labels"
]

# Quy tắc ép kiểu
class_mapping = {0: 2, 1: 0, 2: 0}

for folder in label_folders:
    if not os.path.exists(folder):
        continue
    txt_files = glob.glob(os.path.join(folder, "*.txt"))
    for file_path in txt_files:
        new_lines = []
        with open(file_path, 'r') as f:
            lines = f.readlines()
            for line in lines:
                parts = line.strip().split()
                if len(parts) >= 5:
                    old_class_id = int(parts[0])
                    if old_class_id in class_mapping:
                        new_class_id = class_mapping[old_class_id]
                        new_line = f"{new_class_id} {' '.join(parts[1:])}\n"
                        new_lines.append(new_line)
        with open(file_path, 'w') as f:
            f.writelines(new_lines)
print("🎉 Đã đổi nhãn thành công cho bộ Helmet & Biển số!")