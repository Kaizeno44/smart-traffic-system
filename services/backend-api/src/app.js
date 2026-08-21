require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const violationRoutes = require('./routes/violationRoutes');
const { connectRabbitMQ } = require('./services/rabbitmqService'); // Nhúng service RabbitMQ

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('public/uploads'));

// Khởi chạy kết nối Database và RabbitMQ
pool.connect((err, client, release) => {
  if (err) console.error('Lỗi kết nối Database:', err.stack);
  else {
    console.log('Đã kết nối thành công với cơ sở dữ liệu PostgreSQL!');
    release();
  }
});
connectRabbitMQ(); // Gọi hàm kết nối RabbitMQ

app.use('/api/violations', violationRoutes);

app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});