const express = require('express');
const router = express.Router();
const uploadVideo = require('../middlewares/uploadVideo');
const {
  uploadVideoHandler,
  listPendingVideos,
  listProcessedVideos,
  deleteVideo,
  receiveProgress,
  getVideoMetadata,
  streamVideo,
  cancelProcessing,       // ✅ THÊM DÒNG NÀY
} = require('../controllers/videoController');

// ============ UPLOAD ============
router.post('/upload', uploadVideo.single('video'), uploadVideoHandler);

// ============ LIST ============
router.get('/pending', listPendingVideos);
router.get('/processed', listProcessedVideos);

// ============ DELETE ============
router.delete('/:filename', deleteVideo);

// ============ PROGRESS + METADATA ============
router.post('/progress', receiveProgress);
router.get('/metadata/:filename', getVideoMetadata);

// ============ STREAM (Preview) ============
router.get('/stream/:filename', streamVideo);

// ============ CANCEL ============
router.post('/cancel/:filename', cancelProcessing);

module.exports = router;