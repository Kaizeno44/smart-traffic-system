import os
import time
import logging
import requests
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

# ================== CẤU HÌNH ==================
# Trong Docker: dùng tên service "backend" — KHÔNG dùng localhost
# Fallback cho dev local: localhost:3000
API_URL = os.getenv("BACKEND_URL", "http://backend:3000/api/violations")
API_TIMEOUT = int(os.getenv("API_TIMEOUT", "15"))       # giây
API_MAX_RETRIES = int(os.getenv("API_MAX_RETRIES", "2"))
API_RETRY_DELAY = float(os.getenv("API_RETRY_DELAY", "1.5"))  # giây


# ================== HELPERS ==================

def _open_file(path: Optional[str]):
    """Mở file an toàn — trả về file object hoặc None."""
    if not path:
        return None
    if not os.path.exists(path):
        logger.warning(f"[Publisher] File không tồn tại: {path}")
        return None
    try:
        return open(path, "rb")
    except OSError as e:
        logger.warning(f"[Publisher] Không mở được file {path}: {e}")
        return None


def _validate_input(plate_number: str, violation_type: str) -> bool:
    """Kiểm tra dữ liệu tối thiểu trước khi gửi."""
    if not violation_type:
        logger.error("[Publisher] Thiếu violation_type — bỏ qua")
        return False
    if plate_number is None:
        # Cho phép gửi khi chưa rõ biển số (sẽ gửi chuỗi rỗng)
        plate_number = ""
    return True


def _format_response_error(resp: requests.Response) -> str:
    """Cắt ngắn body lỗi để log gọn."""
    body = (resp.text or "").strip().replace("\n", " ")
    return body[:200] + ("..." if len(body) > 200 else "")


# ================== API CHÍNH ==================

def send_violation(
    vehicle_id: Any,
    plate_number: str,
    violation_type: str,
    confidence: float,
    timestamp: str,
    image_path: Optional[str] = None,
    light_status: Optional[str] = None,
    plate_image_path: Optional[str] = None,
    video_path: Optional[str] = None,
    vehicle_type: str = "Xe may",
) -> bool:
    """
    Gửi dữ liệu vi phạm + hình ảnh lên Backend Node.js.

    Returns:
        True nếu gửi thành công (HTTP 2xx), False nếu thất bại.
    """
    # ---- Validate ----
    if not _validate_input(plate_number, violation_type):
        return False

    plate_display = plate_number or "CHUA_RO_BS"

    # ---- Build payload text ----
    data: Dict[str, Any] = {
        "vehicle_id": str(vehicle_id) if vehicle_id is not None else "",
        "license_plate": plate_number or "",
        "vehicle_type": vehicle_type,
        "violation_type": violation_type,
        "confidence": float(confidence),
        "timestamp": str(timestamp),
    }
    if light_status:
        data["light_status"] = light_status

    # ---- Chuẩn bị file handles ----
    files: Dict[str, Any] = {}
    opened_files = []   # để đóng trong finally

    pano_f = _open_file(image_path)
    if pano_f:
        files["panorama_image"] = pano_f
        opened_files.append(pano_f)

    lp_f = _open_file(plate_image_path)
    if lp_f:
        files["license_plate_image"] = lp_f
        opened_files.append(lp_f)

    vid_f = _open_file(video_path)
    if vid_f:
        files["violation_video"] = vid_f
        opened_files.append(vid_f)

    # ---- Gửi với retry ----
    logger.info(f"[Publisher] Gửi vi phạm ID={vehicle_id} | Biển: {plate_display} "
                f"| Loại: {violation_type} | Files: {list(files.keys())}")

    last_error = None
    try:
        for attempt in range(1, API_MAX_RETRIES + 1):
            try:
                # Reset vị trí file cho lần retry
                for f in opened_files:
                    f.seek(0)

                resp = requests.post(
                    API_URL,
                    data=data,
                    files=files if files else None,
                    timeout=API_TIMEOUT,
                )

                if 200 <= resp.status_code < 300:
                    logger.info(
                        f"[Publisher] ✅ Gửi thành công (HTTP {resp.status_code}) "
                        f"ID={vehicle_id} Biển={plate_display}"
                    )
                    return True

                # Server trả lỗi 4xx/5xx
                logger.warning(
                    f"[Publisher] ⚠️ Server trả HTTP {resp.status_code} "
                    f"(lần {attempt}/{API_MAX_RETRIES}): {_format_response_error(resp)}"
                )
                last_error = f"HTTP {resp.status_code}"

                # 4xx (client error) → không retry, trừ 408/429
                if 400 <= resp.status_code < 500 and resp.status_code not in (408, 429):
                    break

            except requests.exceptions.Timeout as e:
                last_error = f"Timeout: {e}"
                logger.warning(f"[Publisher] Timeout lần {attempt}/{API_MAX_RETRIES}")
            except requests.exceptions.ConnectionError as e:
                last_error = f"ConnectionError: {e}"
                logger.warning(
                    f"[Publisher] Không kết nối được backend "
                    f"(lần {attempt}/{API_MAX_RETRIES}) — URL: {API_URL}"
                )
            except requests.exceptions.RequestException as e:
                last_error = str(e)
                logger.warning(f"[Publisher] Request lỗi: {e}")

            # Đợi trước khi retry
            if attempt < API_MAX_RETRIES:
                time.sleep(API_RETRY_DELAY)

        logger.error(
            f"[Publisher] ❌ Gửi thất bại sau {API_MAX_RETRIES} lần "
            f"| ID={vehicle_id} Biển={plate_display} | Lỗi cuối: {last_error}"
        )
        return False

    except Exception as e:
        logger.exception(f"[Publisher] Lỗi không mong đợi: {e}")
        return False

    finally:
        # Đảm bảo luôn đóng file — tránh memory leak
        for f in opened_files:
            try:
                f.close()
            except Exception:
                pass

def send_violation_video_update(bike_id, video_path):
    """
    Gửi cập nhật video cho vi phạm đã có.
    Gọi sau khi recorder ghi xong clip (2 giây sau vi phạm).
    """
    import requests
    if not os.path.exists(video_path):
        return False
    
    # Endpoint cập nhật video theo vehicle_id
    endpoint = os.getenv(
        "BACKEND_UPDATE_URL",
        "http://backend:3000/api/violations/update-video"
    )
    
    try:
        with open(video_path, 'rb') as f:
            files = {'violation_video': (os.path.basename(video_path), f, 'video/mp4')}
            data = {'vehicle_id': str(bike_id)}
            
            resp = requests.post(endpoint, data=data, files=files, timeout=30)
            
            if 200 <= resp.status_code < 300:
                print(f"[Publisher] ✅ Gửi video ID={bike_id} thành công (HTTP {resp.status_code})")
                return True
            else:
                print(f"[Publisher] ⚠️ Server trả {resp.status_code}: {resp.text[:200]}")
                return False
    except Exception as e:
        print(f"[Publisher] ❌ Lỗi gửi video ID={bike_id}: {e}")
        return False


# ================== SELF-TEST (chạy trực tiếp) ==================
if __name__ == "__main__":
    # Test nhanh: python publisher.py
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    print(f"API_URL = {API_URL}")
    print(f"Timeout = {API_TIMEOUT}s, Retries = {API_MAX_RETRIES}")

    ok = send_violation(
        vehicle_id=999,
        plate_number="51G-12345",
        violation_type="RED_LIGHT",
        confidence=0.92,
        timestamp="2026-09-18T12:00:00",
        light_status="red",
    )
    print("Kết quả:", "✅ OK" if ok else "❌ FAIL")