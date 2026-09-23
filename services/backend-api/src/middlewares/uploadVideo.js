const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Folder lưu video (shared với AI)
const VIDEO_DIR = '/app/videos';
if (!fs.existsSync(VIDEO_DIR)) {
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
}

// Cấu hình storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, VIDEO_DIR);
  },
  filename: (req, file, cb) => {
    // Giữ tên gốc, thêm timestamp để tránh trùng
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_');   // Sanitize
    const timestamp = Date.now();
    cb(null, `${baseName}_${timestamp}${ext}`);
  },
});

// Filter chỉ nhận video
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'video/mp4',
    'video/avi',
    'video/x-msvideo',
    'video/quicktime',
    'video/x-matroska',
    'video/webm',
  ];
  const allowedExts = ['.mp4', '.avi', '.mov', '.mkv', '.webm'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Định dạng không hỗ trợ: ${file.mimetype}`), false);
  }
};

const uploadVideo = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024,   // Max 500 MB
  },
});

module.exports = uploadVideo;