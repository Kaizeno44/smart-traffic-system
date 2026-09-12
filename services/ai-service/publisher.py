import requests
import os

# Đường dẫn đến API Backend của bạn
API_URL = "http://localhost:3000/api/violations"

def send_violation(vehicle_id, plate_number, violation_type, confidence, timestamp, image_path, light_status=None, plate_image_path=None, video_path=None):
    """
    Hàm gửi dữ liệu vi phạm và hình ảnh lên Backend Node.js
    """
    files = {}
    try:
        # 1. Đóng gói dữ liệu dạng chữ (Text)
        data = {
            "license_plate": plate_number,  
            "vehicle_type": "Xe may",       # (Có thể truyền tham số động vào đây nếu AI phân loại được ô tô/xe máy)
            "violation_type": violation_type,
            "confidence": confidence,
            "timestamp": str(timestamp)
        }
        
        # BỔ SUNG: Đóng gói trạng thái đèn tín hiệu (Dành riêng cho lỗi vượt đèn đỏ)
        if light_status:
            data["light_status"] = light_status
            
        # 2. Đóng gói hình ảnh/video bằng chứng (File)
        # 2.1 Ảnh toàn cảnh (Bắt buộc)
        if image_path and os.path.exists(image_path):
            files['panorama_image'] = open(image_path, 'rb')
            
        # 2.2 BỔ SUNG: Ảnh crop biển số (Tùy chọn)
        if plate_image_path and os.path.exists(plate_image_path):
            files['license_plate_image'] = open(plate_image_path, 'rb')
            
        # 2.3 BỔ SUNG: Video vi phạm (Tùy chọn - Giúp Frontend hiển thị được video)
        if video_path and os.path.exists(video_path):
            files['violation_video'] = open(video_path, 'rb')
        
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
        # Giải phóng bộ nhớ: Đóng tất cả các file đã mở một cách an toàn
        for key, file_obj in files.items():
            file_obj.close()