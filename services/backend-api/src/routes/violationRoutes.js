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

// Route cap nhat trang thai (PUT)
router.put('/:id/status', updateStatus);

// Route noi bo de Consumer goi khi luu xong vao Database (Webhook Socket.io)
router.post('/notify-realtime', (req, res) => {
  const io = req.app.get('io');
  if (io) {
    io.emit('new_violation', req.body);
    console.log(`[Socket] Da phat song vi pham cua xe ${req.body.license_plate} len Frontend`);
  }
  res.status(200).json({ success: true });
});

module.exports = router;