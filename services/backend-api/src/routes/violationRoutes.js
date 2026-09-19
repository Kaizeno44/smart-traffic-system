const express = require('express');
const router = express.Router();
const { createViolation, getViolations, updateStatus } = require('../controllers/violationController');
const upload = require('../middlewares/upload');

const imageUpload = upload.fields([
  { name: 'panorama_image', maxCount: 1 },
  { name: 'license_plate_image', maxCount: 1 },
  { name: 'violation_video', maxCount: 1 }
]);

router.post('/', imageUpload, createViolation);
router.get('/', getViolations);
router.put('/:id/status', updateStatus);

// Webhook: Worker gọi sau khi lưu DB → Socket.io bắn cho Frontend
router.post('/notify-realtime', (req, res) => {
  const io = req.app.get('io');
  if (io) {
    // Ưu tiên event name do worker chỉ định
    const eventName = req.body.event || 'new_violation';
    io.emit(eventName, req.body);
    console.log(
      `[Socket] Đã phát sự kiện '${eventName}' cho xe ${req.body.license_plate}`
    );
  }
  res.status(200).json({ success: true });
});

module.exports = router;