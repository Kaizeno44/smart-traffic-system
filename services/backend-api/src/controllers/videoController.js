const fs = require('fs');
const path = require('path');

const VIDEO_DIR = '/app/videos';
const PROCESSED_DIR = path.join(VIDEO_DIR, 'processed');

// ============ UPLOAD VIDEO ============
const uploadVideoHandler = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Không có file video nào được upload',
      });
    }

    console.log(`[Video] Upload thành công: ${req.file.filename} (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);

    res.status(200).json({
      success: true,
      message: 'Upload video thành công. AI sẽ tự động xử lý.',
      data: {
        filename: req.file.filename,
        size: req.file.size,
        uploaded_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Lỗi upload video:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Lỗi server',
    });
  }
};

// ============ LIST VIDEOS (đang chờ xử lý) ============
const listPendingVideos = async (req, res) => {
  try {
    if (!fs.existsSync(VIDEO_DIR)) {
      return res.json({ success: true, data: [] });
    }

    const files = fs.readdirSync(VIDEO_DIR);
    const videos = files
      .filter((f) => {
        const ext = path.extname(f).toLowerCase();
        return ['.mp4', '.avi', '.mov', '.mkv', '.webm'].includes(ext);
      })
      .filter((f) => !f.startsWith('.processing_'))   // Bỏ file đang xử lý
      .filter((f) => f !== 'processed')                 // Bỏ folder processed
      .map((f) => {
        const fullPath = path.join(VIDEO_DIR, f);
        const stat = fs.statSync(fullPath);
        return {
          filename: f,
          size: stat.size,
          size_mb: (stat.size / 1024 / 1024).toFixed(2),
          uploaded_at: stat.birthtime.toISOString(),
          status: 'pending',
        };
      })
      .sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at));

    res.json({ success: true, data: videos });
  } catch (error) {
    console.error('Lỗi list videos:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ============ LIST PROCESSED VIDEOS ============
const listProcessedVideos = async (req, res) => {
  try {
    if (!fs.existsSync(PROCESSED_DIR)) {
      return res.json({ success: true, data: [] });
    }

    const files = fs.readdirSync(PROCESSED_DIR);
    const videos = files
      .filter((f) => {
        const ext = path.extname(f).toLowerCase();
        return ['.mp4', '.avi', '.mov', '.mkv', '.webm'].includes(ext);
      })
      .map((f) => {
        const fullPath = path.join(PROCESSED_DIR, f);
        const stat = fs.statSync(fullPath);
        return {
          filename: f,
          size: stat.size,
          size_mb: (stat.size / 1024 / 1024).toFixed(2),
          processed_at: stat.mtime.toISOString(),
          status: 'processed',
        };
      })
      .sort((a, b) => new Date(b.processed_at) - new Date(a.processed_at));

    res.json({ success: true, data: videos });
  } catch (error) {
    console.error('Lỗi list processed:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ============ DELETE VIDEO ============
const deleteVideo = async (req, res) => {
  try {
    const { filename } = req.params;
    const { type } = req.query;   // 'pending' hoặc 'processed'

    // Sanitize để tránh path traversal
    const safeName = path.basename(filename);
    const dir = type === 'processed' ? PROCESSED_DIR : VIDEO_DIR;
    const filePath = path.join(dir, safeName);

    // Verify file nằm trong đúng folder
    if (!filePath.startsWith(dir)) {
      return res.status(400).json({ success: false, message: 'Invalid path' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File không tồn tại' });
    }

    fs.unlinkSync(filePath);
    console.log(`[Video] Đã xóa: ${safeName}`);

    res.json({ success: true, message: 'Đã xóa video' });
  } catch (error) {
    console.error('Lỗi xóa video:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

module.exports = {
  uploadVideoHandler,
  listPendingVideos,
  listProcessedVideos,
  deleteVideo,
};