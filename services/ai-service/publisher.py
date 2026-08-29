import requests
import os

# Đường dẫn đến API Backend của bạn
API_URL = "http://localhost:3000/api/violations"

def send_violation(vehicle_id, plate_number, violation_type, confidence, timestamp, image_path):
    """
    Hàm gửi dữ liệu vi phạm và hình ảnh lên Backend Node.js
    """
    try:
        # 1. Đóng gói dữ liệu dạng chữ (Text)
        data = {
            "license_plate": plate_number,  # ĐÃ SỬA: Đổi từ plate_number thành license_plate
            "vehicle_type": "Xe may",       # ĐÃ THÊM: Bổ sung loại phương tiện cho Database
            "violation_type": violation_type,
            "confidence": confidence,
            "timestamp": str(timestamp)
        }
        
        # 2. Đóng gói hình ảnh bằng chứng (File)
        files = {}
        if image_path and os.path.exists(image_path):
            # ĐÃ SỬA: Đổi tên trường thành 'panorama_image' để khớp với Multer bên Node.js
            files['panorama_image'] = open(image_path, 'rb')
        
        print(f"[Publisher] Dang gui vi pham cua xe {plate_number} len Server...")
        
        # 3. Bắn dữ liệu qua API
        response = requests.post(API_URL, data=data, files=files, timeout=10)
        
        # 4. Kiểm tra kết quả
        if response.status_code in [200, 201, 202]:
            print(f"[Publisher] Da gui thanh cong! Server phan hoi: {response.status_code}")
        else:
            print(f"[Publisher] Loi tu server: {response.status_code} - {response.text}")
            
    except Exception as e:
        print(f"[Publisher] Loi ket noi den Backend API: {str(e)}")
    finally:
        # Đóng file ảnh sau khi gửi xong để giải phóng bộ nhớ
        if 'panorama_image' in files:
            files['panorama_image'].close()