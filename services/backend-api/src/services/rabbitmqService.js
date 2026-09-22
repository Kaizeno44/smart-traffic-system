const amqp = require('amqplib');

let channel = null;
let connection = null;
let isConnecting = false;

const QUEUE_NAME = 'violation_queue';
const MAX_RETRIES = 30;        // 30 lần × 2s = 60s tối đa
const RETRY_DELAY_MS = 2000;


async function connectRabbitMQ() {
  if (isConnecting) return;
  isConnecting = true;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      connection = await amqp.connect(process.env.RABBITMQ_URL);
      channel = await connection.createChannel();

      await channel.assertQueue(QUEUE_NAME, { durable: true });

      console.log(`[RabbitMQ]  Đã kết nối thành công (lần ${attempt})`);

      // Tự reconnect nếu mất kết nối
      connection.on('close', () => {
        console.warn('[RabbitMQ]  Mất kết nối, đang thử lại...');
        channel = null;
        connection = null;
        isConnecting = false;
        setTimeout(connectRabbitMQ, RETRY_DELAY_MS);
      });

      connection.on('error', (err) => {
        console.error('[RabbitMQ] Lỗi:', err.message);
      });

      isConnecting = false;
      return;

    } catch (error) {
      console.error(
        `[RabbitMQ] Kết nối thất bại (lần ${attempt}/${MAX_RETRIES}): ${error.message}`
      );

      if (attempt === MAX_RETRIES) {
        console.error('[RabbitMQ]  Đã hết lần thử — kiểm tra RabbitMQ service!');
        isConnecting = false;
        return;
      }

      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }
}


async function publishViolation(data) {
  if (!channel) {
    console.error('[RabbitMQ]  Channel chưa sẵn sàng — bỏ qua message');
    console.error('  → Data:', JSON.stringify(data).slice(0, 200));
    return false;
  }
  try {
    channel.sendToQueue(
      QUEUE_NAME,
      Buffer.from(JSON.stringify(data)),
      { persistent: true }
    );
    return true;
  } catch (err) {
    console.error('[RabbitMQ] Lỗi publish:', err.message);
    return false;
  }
}


module.exports = {
  connectRabbitMQ,
  publishViolation,
};