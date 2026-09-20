"""
Test Lane Detector với ảnh tĩnh hoặc video.
Chạy: python test_lane_detector.py <path_video_or_image>
"""
import sys
import os
import cv2
import time

from core.lane_detector import LaneDetector


def test_image(img_path, detector):
    """Test với 1 ảnh."""
    img = cv2.imread(img_path)
    if img is None:
        print(f"❌ Không đọc được: {img_path}")
        return

    print(f"\n📷 {os.path.basename(img_path)} | {img.shape[1]}x{img.shape[0]}")

    t0 = time.time()
    stop_line = detector.detect(img)
    dt = (time.time() - t0) * 1000

    print(f"⏱️  Thời gian: {dt:.1f} ms")

    if stop_line:
        (x1, y1), (x2, y2) = stop_line
        print(f"✅ Vạch dừng: ({x1},{y1}) → ({x2},{y2})")
    else:
        print(f"❌ Không detect được vạch dừng")

    # Vẽ visualization
    vis = detector.visualize(img, stop_line)
    out_path = f"lane_test_{os.path.basename(img_path)}"
    cv2.imwrite(out_path, vis)
    print(f"💾 Đã lưu: {out_path}")


def test_video(video_path, detector, skip_frames=15):
    """Test với video, sample mỗi N frame."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"❌ Không mở được video: {video_path}")
        return

    frame_count = 0
    detected = 0
    not_detected = 0
    samples = []

    print(f"\n🎬 Testing: {os.path.basename(video_path)}")
    print(f"Sample mỗi {skip_frames} frame...\n")

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        frame_count += 1
        if frame_count % skip_frames != 0:
            continue

        stop_line = detector.detect(frame)

        if stop_line:
            detected += 1
            samples.append((frame_count, stop_line))
            (x1, y1), (x2, y2) = stop_line
            print(f"  Frame {frame_count}: ✅ ({x1},{y1}) → ({x2},{y2})")
        else:
            not_detected += 1
            print(f"  Frame {frame_count}: ❌ không detect")

        # Lưu 3 frame đầu có detect được
        if detected <= 3 and stop_line:
            vis = detector.visualize(frame, stop_line)
            out_path = f"lane_test_frame_{frame_count}.jpg"
            cv2.imwrite(out_path, vis)

    cap.release()

    total = detected + not_detected
    rate = (detected / total * 100) if total else 0

    print(f"\n{'='*50}")
    print(f"📊 KẾT QUẢ:")
    print(f"  Tổng frame sample: {total}")
    print(f"  ✅ Detect được   : {detected} ({rate:.1f}%)")
    print(f"  ❌ Không detect  : {not_detected}")
    print(f"{'='*50}")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "dendo2.mp4"

    if not os.path.exists(path):
        print(f"❌ Không tìm thấy: {path}")
        sys.exit(1)

    print("⚙️  Khởi tạo LaneDetector (debug mode)...")
    detector = LaneDetector(debug=True)

    if path.lower().endswith(('.mp4', '.avi', '.mkv', '.mov')):
        test_video(path, detector)
    else:
        test_image(path, detector)