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
      .filter((f) => f !== 'processed')
      .map((f) => {
        // ✅ Xử lý file .processing_*
        const isProcessing = f.startsWith('.processing_');
        const displayName = isProcessing ? f.replace('.processing_', '') : f;
        
        const fullPath = path.join(VIDEO_DIR, f);
        const stat = fs.statSync(fullPath);
        
        return {
          filename: displayName,           // Tên gốc (match với socket event)
          actual_filename: f,              // Tên thực tế trên disk
          size: stat.size,
          size_mb: (stat.size / 1024 / 1024).toFixed(2),
          uploaded_at: stat.birthtime.toISOString(),
          status: isProcessing ? 'processing' : 'pending',
          is_processing: isProcessing,
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
    const { type } = req.query;
    const safeName = path.basename(filename);
    const dir = type === 'processed' ? PROCESSED_DIR : VIDEO_DIR;
    
    // Thử cả 2 tên: gốc và .processing_
    const candidates = [
      path.join(dir, safeName),
      path.join(dir, `.processing_${safeName}`),
    ];
    
    let filePath = null;
    for (const cand of candidates) {
      if (cand.startsWith(dir) && fs.existsSync(cand)) {
        filePath = cand;
        break;
      }
    }
    
    if (!filePath) {
      return res.status(404).json({ success: false, message: 'File không tồn tại' });
    }
    
    fs.unlinkSync(filePath);
    console.log(`[Video] Đã xóa: ${path.basename(filePath)}`);
    res.json({ success: true, message: 'Đã xóa video' });
  } catch (error) {
    console.error('Lỗi xóa video:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ============ RECEIVE PROGRESS FROM AI ============
const receiveProgress = (req, res) => {
  const { filename, frame_current, frame_total, violations_count, percent } = req.body;
  
  if (!filename) {
    return res.status(400).json({ success: false, message: 'Thiếu filename' });
  }

  const io = req.app.get('io');
  if (io) {
    io.emit('video_progress', {
      filename,
      frame_current,
      frame_total,
      violations_count,
      percent,
      updated_at: new Date().toISOString(),
    });
  }
  
  res.json({ success: true });
};

// ============ GET METADATA ============
const getVideoMetadata = (req, res) => {
  try {
    const { filename } = req.params;
    const safeName = path.basename(filename);

    // Tìm trong pending hoặc processed
    const paths = [
      path.join(VIDEO_DIR, `${safeName}.json`),
      path.join(PROCESSED_DIR, `${safeName}.json`),
    ];

    for (const metaPath of paths) {
      if (fs.existsSync(metaPath)) {
        const data = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        return res.json({ success: true, data });
      }
    }

    res.json({ success: true, data: null });
  } catch (error) {
    console.error('Lỗi đọc metadata:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ============ STREAM VIDEO (cho preview) ============
const streamVideo = (req, res) => {
  try {
    const { filename } = req.params;
    const { type } = req.query;
    const safeName = path.basename(filename);
    const dir = type === 'processed' ? PROCESSED_DIR : VIDEO_DIR;
    const candidates = [
      path.join(dir, safeName),
      path.join(dir, `.processing_${safeName}`),
    ];
    let filePath = null;
    for (const cand of candidates) {
      if (cand.startsWith(dir) && fs.existsSync(cand)) {
        filePath = cand;
        break;
      }
    }
    if (!filePath) {
      return res.status(404).json({ success: false, message: 'File không tồn tại' });
    }
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;
    if (range) {
      // Range request → stream
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const stream = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      });
      stream.pipe(res);
    } else {
      // Full request
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (error) {
    console.error('Lỗi stream video:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ============ CANCEL AI PROCESSING ============
const cancelProcessing = async (req, res) => {
  try {
    const { filename } = req.params;
    if (!filename) {
      return res.status(400).json({ success: false, message: 'Thiếu filename' });
    }
    // Gọi AI service để cancel
    const AI_CANCEL_URL = process.env.AI_CANCEL_URL || 'http://ai:9999/cancel';
    try {
      const response = await fetch(AI_CANCEL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      if (response.ok) {
        console.log(`[Cancel] Đã gửi cancel cho AI: ${filename}`);
        return res.json({ success: true, message: 'Đã gửi yêu cầu hủy' });
      } else {
        return res.status(500).json({ success: false, message: 'AI không phản hồi' });
      }
    } catch (fetchErr) {
      console.error('[Cancel] Lỗi kết nối AI:', fetchErr.message);
      return res.status(503).json({ success: false, message: 'Không kết nối được AI service' });
    }
  } catch (error) {
    console.error('Lỗi cancel:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

module.exports = {
  uploadVideoHandler,
  listPendingVideos,
  listProcessedVideos,
  deleteVideo,
  receiveProgress,
  getVideoMetadata,
  streamVideo,
  cancelProcessing,      // ← THÊM
};