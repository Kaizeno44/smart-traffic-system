const express = require('express');
const router = express.Router();
const uploadVideo = require('../middlewares/uploadVideo');
const {
  uploadVideoHandler,
  listPendingVideos,
  listProcessedVideos,
  deleteVideo,
  receiveProgress,       // ← THÊM
  getVideoMetadata,      // ← THÊM
} = require('../controllers/videoController');

// Upload 1 video
router.post('/upload', uploadVideo.single('video'), uploadVideoHandler);

// Danh sách video đang chờ xử lý
router.get('/pending', listPendingVideos);

// Danh sách video đã xử lý
router.get('/processed', listProcessedVideos);

// Xóa video
router.delete('/:filename', deleteVideo);

router.post('/progress', receiveProgress);              // ← THÊM
router.get('/metadata/:filename', getVideoMetadata);    // ← THÊM

module.exports = router;