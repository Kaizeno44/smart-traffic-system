const amqp = require('amqplib');

let channel = null;

// Hàm kết nối RabbitMQ
const connectRabbitMQ = async () => {
  try {
    const connection = await amqp.connect(process.env.RABBITMQ_URL);
    channel = await connection.createChannel();
    
    // Tạo một hàng đợi có tên violation_queue (durable: true để không mất dữ liệu khi restart)
    await channel.assertQueue('violation_queue', { durable: true });
    console.log('Đã kết nối thành công với RabbitMQ!');
  } catch (error) {
    console.error('Lỗi kết nối RabbitMQ:', error);
  }
};

// Hàm đẩy dữ liệu vào hàng đợi
const publishViolation = async (data) => {
  if (!channel) {
    console.error('Channel RabbitMQ chưa được khởi tạo!');
    return;
  }
  // Biến dữ liệu thành chuỗi và đẩy vào queue
  channel.sendToQueue('violation_queue', Buffer.from(JSON.stringify(data)), {
    persistent: true // Đảm bảo tin nhắn được lưu xuống ổ cứng
  });
};

module.exports = {
  connectRabbitMQ,
  publishViolation
};