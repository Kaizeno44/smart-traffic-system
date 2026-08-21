import os
import pandas as pd
from datetime import datetime

def is_violation(has_helmet, has_no_helmet, license_plate=""):
    """
    Quy tắc xác định vi phạm giao thông:
    - Có phát hiện người không đội mũ bảo hiểm (has_no_helmet = True)
    - Hoặc không phát hiện đội mũ bảo hiểm trong khi đang xử lý xe
    """
    violation = has_no_helmet or (not has_helmet and has_no_helmet)
    if license_plate and len(license_plate) > 0:
        return violation and len(license_plate) >= 5
    return violation

def build_violation_payload(license_plate, bike_img_path, video_source="Cam_01"):
    """Đóng gói dữ liệu vi phạm chuẩn bị đẩy sang RabbitMQ hoặc lưu Database"""
    return {
        "license_plate": license_plate,
        "violation_type": "NO_HELMET",
        "timestamp": datetime.now().isoformat(),
        "camera_id": video_source,
        "evidence_image": bike_img_path
    }