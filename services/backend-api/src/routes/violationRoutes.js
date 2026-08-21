const express = require('express');
const router = express.Router();
const { createViolation, getViolations, updateStatus } = require('../controllers/violationController');
const upload = require('../middlewares/upload');

const imageUpload = upload.fields([
  { name: 'panorama_image', maxCount: 1 },
  { name: 'license_plate_image', maxCount: 1 }
]);

router.post('/', imageUpload, createViolation);
router.get('/', getViolations);

// Route cập nhật trạng thái (PUT)
router.put('/:id/status', updateStatus);

module.exports = router;