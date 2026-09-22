"""
Test OCR model trên ảnh biển số.
Chạy:
    python test_model.py                          # auto-scan output_violations/
    python test_model.py path/to/img1.jpg ...     # test ảnh cụ thể
    python test_model.py --dir path/to/folder     # test cả folder
"""
import os
import sys
import glob
import time
import argparse
import cv2

from core.ocr import LicensePlateOCR


def test_single_image(ocr_engine, img_path, verbose=False):
    """Test 1 ảnh, trả về (success, plate, conf, time_ms)."""
    img = cv2.imread(img_path)
    if img is None:
        print(f"  ❌ Không đọc được ảnh: {img_path}")
        return False, "", 0.0, 0.0

    h, w = img.shape[:2]
    print(f"\n📷 {os.path.basename(img_path)} | {w}x{h}")

    t0 = time.time()
    plate_text, conf = ocr_engine.read_plate(img)
    dt_ms = (time.time() - t0) * 1000

    if plate_text:
        print(f"   ✅ Biển số    : {plate_text}")
        print(f"   📊 Confidence : {conf:.3f}")
        print(f"   ⏱️  Thời gian  : {dt_ms:.1f} ms")
        return True, plate_text, conf, dt_ms
    else:
        print(f"   ❌ Không đọc được biển số")
        print(f"   ⏱️  Thời gian  : {dt_ms:.1f} ms")
        return False, "", conf, dt_ms


def collect_images(args):
    """Xác định danh sách ảnh cần test từ CLI args."""
    paths = []

    if args.files:
        # Ưu tiên 1: path cụ thể từ CLI
        paths = args.files

    elif args.dir:
        # Ưu tiên 2: --dir folder
        if not os.path.isdir(args.dir):
            print(f"❌ Không phải folder: {args.dir}")
            return []
        for ext in ("*.jpg", "*.jpeg", "*.png", "*.bmp"):
            paths.extend(glob.glob(os.path.join(args.dir, ext)))

    else:
        # Mặc định: scan output_violations/
        default_dir = "output_violations"
        if not os.path.isdir(default_dir):
            print(f"❌ Không có folder '{default_dir}'. Chạy:")
            print(f"   python test_model.py <path_to_image>")
            return []

        # Ưu tiên ảnh LP (biển số), sau đó ảnh toàn cảnh
        lp_imgs = glob.glob(os.path.join(default_dir, "*_LP_*.jpg"))
        if lp_imgs:
            paths = lp_imgs
            print(f"📁 Auto-scan: {len(lp_imgs)} ảnh biển số trong '{default_dir}/'")
        else:
            paths = glob.glob(os.path.join(default_dir, "*.jpg"))
            print(f"📁 Auto-scan: {len(paths)} ảnh trong '{default_dir}/'")

    # Filter file tồn tại
    paths = [p for p in paths if os.path.isfile(p)]
    paths.sort()
    return paths


def main():
    parser = argparse.ArgumentParser(description="Test OCR model trên ảnh biển số")
    parser.add_argument("files", nargs="*", help="Đường dẫn ảnh cụ thể")
    parser.add_argument("--dir", type=str, default=None,
                        help="Folder chứa ảnh cần test")
    parser.add_argument("--gpu", action="store_true",
                        help="Dùng GPU (mặc định CPU)")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="In chi tiết log")
    args = parser.parse_args()

    print("=" * 60)
    print("🧪 TEST OCR MODEL — LicensePlateOCR")
    print("=" * 60)

    print(f"\n⚙️  Khởi tạo model (device={'gpu' if args.gpu else 'cpu'})...")
    t0 = time.time()
    ocr_engine = LicensePlateOCR(use_gpu=args.gpu)
    print(f"✅ Nạp model xong ({time.time() - t0:.1f}s)")

    # Lấy danh sách ảnh
    img_paths = collect_images(args)
    if not img_paths:
        print("\n⚠️  Không có ảnh nào để test.")
        return

    print(f"\n🔍 Bắt đầu test {len(img_paths)} ảnh...")

    # Test từng ảnh
    results = []
    for path in img_paths:
        ok, plate, conf, dt = test_single_image(ocr_engine, path, args.verbose)
        results.append((path, ok, plate, conf, dt))

    # --- Summary ---
    print("\n" + "=" * 60)
    print("📊 KẾT QUẢ TỔNG HỢP")
    print("=" * 60)

    n_total = len(results)
    n_success = sum(1 for r in results if r[1])
    n_fail = n_total - n_success
    success_rate = (n_success / n_total) * 100 if n_total else 0

    avg_conf = (sum(r[3] for r in results if r[1]) / n_success
                if n_success else 0.0)
    avg_time = sum(r[4] for r in results) / n_total if n_total else 0.0

    print(f"  Tổng số ảnh       : {n_total}")
    print(f"  ✅ Thành công     : {n_success}")
    print(f"  ❌ Thất bại       : {n_fail}")
    print(f"  📈 Tỷ lệ thành công: {success_rate:.1f}%")
    print(f"  📊 Confidence TB  : {avg_conf:.3f}")
    print(f"  ⏱️  Thời gian TB   : {avg_time:.1f} ms/ảnh")

    # In danh sách fail để dễ debug
    if n_fail > 0:
        print("\n  ❌ Các ảnh đọc không được:")
        for path, ok, _, _, _ in results:
            if not ok:
                print(f"     - {os.path.basename(path)}")

    print("=" * 60)


if __name__ == "__main__":
    main()