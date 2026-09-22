"""
Video Recorder — Ghi clip 3-5 giây quanh thời điểm vi phạm.
Sử dụng buffer deque để lưu frame trước + sau vi phạm.
"""
import os
import cv2
from collections import deque
from datetime import datetime
import threading


class VideoRecorder:
    """
    Ghi video clip quanh sự kiện vi phạm.
    - Buffer N frame gần nhất (pre-buffer)
    - Khi trigger → ghi buffer + M frame tiếp theo
    """
    
    def __init__(self, output_dir, fps=30, pre_seconds=3, post_seconds=2):
        self.output_dir = output_dir
        self.fps = fps
        self.pre_frames = pre_seconds * fps       # 3s * 30fps = 90 frames
        self.post_frames = post_seconds * fps     # 2s * 30fps = 60 frames
        
        # Buffer toàn cục — lưu frame cho MỌI xe
        self.global_buffer = deque(maxlen=self.pre_frames)
        
        # Recording state per bike_id
        # {bike_id: {'frames': [...], 'remaining': int, 'path': str}}
        self.active_recordings = {}
        
        os.makedirs(output_dir, exist_ok=True)
    
    def add_frame(self, frame, bike_ids_in_frame=None):
        """
        Gọi mỗi frame. Lưu vào buffer global.
        Nếu có bike_id đang trong trạng thái recording → append frame.
        
        Args:
            frame: np.array (BGR)
            bike_ids_in_frame: list các bike_id xuất hiện frame này
        """
        # Luôn append vào global buffer
        self.global_buffer.append(frame.copy())
        
        # Append vào recording đang active
        for bike_id, rec in self.active_recordings.items():
            if rec['remaining'] > 0:
                rec['frames'].append(frame.copy())
                rec['remaining'] -= 1
    
    def start_recording(self, bike_id, violation_type):
        """
        Trigger recording cho 1 bike khi phát hiện vi phạm.
        Trả về path sẽ ghi (chưa có file).
        """
        # Nếu đã đang record cho bike này → bỏ qua
        if bike_id in self.active_recordings:
            return None
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"violation_ID{bike_id}_{violation_type}_{timestamp}.mp4"
        filepath = os.path.join(self.output_dir, filename)
        
        # Lấy pre-buffer (buffer hiện tại)
        pre_frames = list(self.global_buffer)
        
        self.active_recordings[bike_id] = {
            'frames': pre_frames,
            'remaining': self.post_frames,
            'path': filepath,
        }
        
        print(f"  [Recorder] Bắt đầu ghi clip cho ID={bike_id} | {filename}")
        return filepath
    
    def finalize_recording(self, bike_id):
        """
        Khi đã đủ frame post → ghi ra file mp4 (H.264).
        """
        if bike_id not in self.active_recordings:
            return None
            
        rec = self.active_recordings[bike_id]
        frames = rec['frames']
        filepath = rec['path']
        
        del self.active_recordings[bike_id]
        
        if len(frames) < 10:
            print(f"  [Recorder] Quá ít frame cho ID={bike_id}, bỏ qua")
            return None
            
        try:
            h, w = frames[0].shape[:2]
            
            # Resize xuống max 640px để giảm size
            MAX_WIDTH = 640
            if w > MAX_WIDTH:
                scale = MAX_WIDTH / w
                new_w, new_h = MAX_WIDTH, int(h * scale)
                frames = [cv2.resize(f, (new_w, new_h),
                                     interpolation=cv2.INTER_AREA)
                          for f in frames]
                w, h = new_w, new_h
                
            # Ghi mp4v tạm (raw), sau đó convert sang H.264 bằng ffmpeg
            temp_path = filepath.replace('.mp4', '_raw.mp4')
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            writer = cv2.VideoWriter(temp_path, fourcc, self.fps, (w, h))
            
            if not writer.isOpened():
                print(f"  [Recorder] ❌ Không mở được VideoWriter")
                return None
                
            for f in frames:
                writer.write(f)
            writer.release()
            
            # ✅ Convert sang H.264 bằng ffmpeg (browser-supported)
            import subprocess
            try:
                subprocess.run([
                    'ffmpeg', '-y',
                    '-i', temp_path,
                    '-c:v', 'libx264',
                    '-preset', 'fast',
                    '-crf', '28',
                    '-pix_fmt', 'yuv420p',
                    '-movflags', '+faststart',
                    filepath
                ], check=True, capture_output=True, timeout=60)
                
                # Xoá file tạm
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                    
                size_kb = os.path.getsize(filepath) / 1024
                print(f"  [Recorder] ✅ Ghi xong ID={bike_id} | "
                      f"{len(frames)} frames | {size_kb:.0f} KB | H.264 | "
                      f"{os.path.basename(filepath)}")
                return filepath
                
            except subprocess.CalledProcessError as e:
                print(f"  [Recorder] ❌ FFmpeg convert failed: {e.stderr.decode()[:200]}")
                # Fallback: giữ file mp4v nếu ffmpeg fail
                if os.path.exists(temp_path):
                    os.replace(temp_path, filepath)
                return filepath
            except FileNotFoundError:
                print(f"  [Recorder] ❌ ffmpeg không có trong PATH — dùng mp4v")
                if os.path.exists(temp_path):
                    os.replace(temp_path, filepath)
                return filepath
                
        except Exception as e:
            print(f"  [Recorder] ❌ Lỗi ghi video: {e}")
            return None
    
    def update(self):
        """
        Gọi mỗi frame. Kiểm tra recording nào đã đủ frame → finalize.
        Trả về list các (bike_id, video_path) đã ghi xong.
        """
        finished = []
        for bike_id in list(self.active_recordings.keys()):
            rec = self.active_recordings[bike_id]
            if rec['remaining'] <= 0:
                path = self.finalize_recording(bike_id)
                if path:
                    finished.append((bike_id, path))
        return finished
    
    def is_recording(self, bike_id):
        return bike_id in self.active_recordings