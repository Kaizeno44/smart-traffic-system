require('dotenv').config();
const amqp = require('amqplib');
const { Pool } = require('pg');

// Kết nối PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const startWorker = async () => {
  try {
    // Kết nối RabbitMQ
    const connection = await amqp.connect(process.env.RABBITMQ_URL);
    const channel = await connection.createChannel();
    
    // Đảm bảo hàng đợi tồn tại
    await channel.assertQueue('violation_queue', { durable: true });
    
    console.log('[*] Worker đang túc trực chờ dữ liệu từ RabbitMQ...');

    // Lắng nghe dữ liệu
    channel.consume('violation_queue', async (msg) => {
      if (msg !== null) {
        // Chuyển đổi dữ liệu từ dạng Buffer về dạng Object (JSON)
        const data = JSON.parse(msg.content.toString());
        console.log(`[x] Đã rút dữ liệu vi phạm của xe: ${data.license_plate} khỏi hàng đợi`);

        try {
          // 1. Kiểm tra và thêm phương tiện (Vehicles)
          let vehicleRes = await pool.query(
            'SELECT id FROM Vehicles WHERE license_plate = $1',
            [data.license_plate]
          );
          let vehicleId;
          if (vehicleRes.rows.length === 0) {
            const insertVehicle = await pool.query(
              'INSERT INTO Vehicles (license_plate, vehicle_type) VALUES ($1, $2) RETURNING id',
              [data.license_plate, data.vehicle_type]
            );
            vehicleId = insertVehicle.rows[0].id;
          } else {
            vehicleId = vehicleRes.rows[0].id;
          }

          // 2. Thêm thông tin vi phạm (Violations)
          const violationRes = await pool.query(
            'INSERT INTO Violations (vehicle_id, violation_type) VALUES ($1, $2) RETURNING id',
            [vehicleId, data.violation_type]
          );
          const violationId = violationRes.rows[0].id;

          // 3. Thêm đường dẫn ảnh bằng chứng (Evidences)
          await pool.query(
            'INSERT INTO Evidences (violation_id, panorama_image_path, license_plate_image_path) VALUES ($1, $2, $3)',
            [violationId, data.panorama_image_path, data.license_plate_image_path]
          );

          // 4. Xác nhận với RabbitMQ rằng đã xử lý xong để xóa tin nhắn khỏi hàng đợi
          channel.ack(msg);
          console.log(`[v] Đã lưu thành công dữ liệu xe ${data.license_plate} vào PostgreSQL!\n`);

        } catch (dbError) {
          console.error('[!] Lỗi khi lưu vào Database:', dbError);
          // Ghi chú: Nếu lỗi xảy ra, ta không gọi channel.ack(msg) để dữ liệu không bị mất và có thể xử lý lại
        }
      }
    });

  } catch (error) {
    console.error('Lỗi khi khởi động Worker:', error);
  }
};

startWorker();