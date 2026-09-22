const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = 'public/uploads/';
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir, { recursive: true });
    }
    // Chỉ định thư mục lưu file
    cb(null, dir); 
  },
  filename: function (req, file, cb) {
    // Đặt tên file mới gồm: timestamp + số ngẫu nhiên + đuôi file gốc (.jpg, .png...)
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// Khởi tạo middleware upload
const upload = multer({ storage: storage });

module.exports = upload;