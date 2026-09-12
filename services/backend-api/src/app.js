require('dotenv').config();
require('./workers/consumer');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const http = require('http'); // 1. Bổ sung thư viện http
const { Server } = require('socket.io'); // 2. Bổ sung thư viện socket.io

const violationRoutes = require('./routes/violationRoutes');
const { connectRabbitMQ } = require('./services/rabbitmqService'); // Nhúng service RabbitMQ

const app = express();
const PORT = process.env.PORT || 3000;

// 3. Tạo HTTP server bọc lấy app Express
const server = http.createServer(app);

// 4. Khởi tạo Socket.io và cấu hình CORS (cho phép React.js gọi vào)
const io = new Server(server, {
  cors: {
    origin: '*', // Bạn có thể giới hạn thành 'http://localhost:5173' để bảo mật hơn
    methods: ['GET', 'POST', 'PUT']
  }
});

// 5. Lưu instance 'io' vào app để các file khác (như violationRoutes) có thể lấy ra dùng
app.set('io', io);

// 6. Lắng nghe sự kiện kết nối từ Frontend
io.on('connection', (socket) => {
  console.log(` [Socket.io] Frontend đã kết nối! ID: ${socket.id}`);
  
  // (Tùy chọn) Bắt sự kiện ngắt kết nối để dễ debug
  socket.on('disconnect', () => {
    console.log(` [Socket.io] Frontend (ID: ${socket.id}) đã ngắt kết nối.`);
  });
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static('public/uploads'));

// Khởi chạy kết nối Database và RabbitMQ
pool.connect((err, client, release) => {
  if (err) console.error('Lỗi kết nối Database:', err.stack);
  else {
    console.log(' Đã kết nối thành công với cơ sở dữ liệu PostgreSQL!');
    release();
  }
});
connectRabbitMQ(); // Gọi hàm kết nối RabbitMQ

app.use('/api/violations', violationRoutes);

// 7. QUAN TRỌNG: Đổi app.listen thành server.listen để chạy cả Express lẫn Socket.io
server.listen(PORT, () => {
  console.log(` API Server đang chạy tại http://localhost:${PORT}`);
  console.log(` Kênh Socket.io đã sẵn sàng phát sóng thời gian thực!`);
});