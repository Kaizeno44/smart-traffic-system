require('dotenv').config();
const amqp = require('amqplib');
const { Pool } = require('pg');

// Khởi tạo connection pool cho PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Có thể thiết lập thêm max connections, idleTimeoutMillis... nếu cần
});

const startWorker = async () => {
  try {
    // Kết nối RabbitMQ
    const connection = await amqp.connect(process.env.RABBITMQ_URL);
    const channel = await connection.createChannel();
    const queue = 'violation_queue';
    
    // Đảm bảo hàng đợi tồn tại
    await channel.assertQueue(queue, { durable: true });
    
    // Giới hạn Worker chỉ lấy 1 tin nhắn mỗi lần (cân bằng tải tốt hơn)
    await channel.prefetch(1);
    
    console.log(`[*] Worker đang túc trực chờ dữ liệu từ RabbitMQ trên queue '${queue}'...`);

    // Lắng nghe dữ liệu
    channel.consume(queue, async (msg) => {
      if (!msg) return;

      const data = JSON.parse(msg.content.toString());
      console.log(`\n[x] Đang xử lý dữ liệu vi phạm của xe: ${data.license_plate}`);

      // Lấy 1 client từ Pool để thực thi Transaction
      const client = await pool.connect();

      try {
        await client.query('BEGIN'); // Bắt đầu Transaction

        // 1. Thêm phương tiện (Sử dụng Upsert để tránh Race Condition)
        const upsertVehicleQuery = `
          INSERT INTO Vehicles (license_plate, vehicle_type) 
          VALUES ($1, $2)
          ON CONFLICT (license_plate) 
          DO UPDATE SET vehicle_type = EXCLUDED.vehicle_type 
          RETURNING id;
        `;
        const vehicleRes = await client.query(upsertVehicleQuery, [data.license_plate, data.vehicle_type]);
        const vehicleId = vehicleRes.rows[0].id;

        // --- BỔ SUNG: Gom các thông tin mở rộng từ AI (VD: Màu đèn, độ tin cậy) ---
        const extraInfo = {};
        if (data.light_status) {
          extraInfo.light_status = data.light_status; // Sẽ lưu 'red', 'yellow'...
        }
        // Dự phòng cho sau này AI gửi thêm độ tự tin (confidence)
        if (data.confidence) {
          extraInfo.confidence = data.confidence;
        }

        // 2. Thêm thông tin vi phạm (Bổ sung cột extra_info)
        const insertViolationQuery = `
          INSERT INTO Violations (vehicle_id, violation_type, extra_info) 
          VALUES ($1, $2, $3) RETURNING id;
        `;
        // Chèn thêm extraInfo (thư viện pg của Node.js sẽ tự động chuyển Object thành JSONB cho PostgreSQL)
        const violationRes = await client.query(insertViolationQuery, [
          vehicleId, 
          data.violation_type, 
          extraInfo 
        ]);
        const violationId = violationRes.rows[0].id;

        // 3. Thêm đường dẫn ảnh bằng chứng (Evidences)
        const insertEvidenceQuery = `
          INSERT INTO Evidences (violation_id, panorama_image_path, license_plate_image_path, video_path) 
          VALUES ($1, $2, $3, $4);
        `;
        await client.query(insertEvidenceQuery, [
          violationId, 
          data.panorama_image_path, 
          data.license_plate_image_path, 
          data.video_path
        ]);

        await client.query('COMMIT'); // Commit nếu mọi thứ thành công

        // 4. Xác nhận với RabbitMQ
        channel.ack(msg);
        console.log(`[v] Đã lưu thành công dữ liệu xe ${data.license_plate} vào PostgreSQL!`);

        data.id = violationId; // Trả về ID thật vừa chèn vào Database
        data.violation_time = data.timestamp; // Đổi tên biến cho khớp chuẩn API

        // ĐOẠN CODE BỔ SUNG: Gọi Webhook để Socket.io bắn sự kiện cho Frontend
        try {
          // Sử dụng hàm fetch (có sẵn trong Node.js từ bản 18+)
          await fetch('http://localhost:3000/api/violations/notify-realtime', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
        } catch (fetchErr) {
          console.error('[!] Lỗi khi gọi webhook thông báo realtime:', fetchErr.message);
        }

      } catch (dbError) {
        await client.query('ROLLBACK'); // Hoàn tác toàn bộ database nếu có bất kỳ lỗi nào
        console.error(`[!] Lỗi khi lưu dữ liệu xe ${data.license_plate}:`, dbError.message);
        
        // Báo cho RabbitMQ biết tin nhắn bị lỗi.
        channel.nack(msg, false, false); 
      } finally {
        // Giải phóng client trả về pool bất kể thành công hay thất bại
        client.release();
      }
    }, { noAck: false });

    // Xử lý Graceful Shutdown (Tắt ứng dụng an toàn)
    process.on('SIGINT', async () => {
      console.log('\n[*] Đang đóng kết nối an toàn...');
      await channel.close();
      await connection.close();
      await pool.end();
      console.log('[*] Đã tắt Worker.');
      process.exit(0);
    });

  } catch (error) {
    console.error('[!] Lỗi khi khởi động Worker:', error);
  }
};

startWorker();