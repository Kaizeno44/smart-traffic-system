require('dotenv').config();
const amqp = require('amqplib');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const BACKEND_NOTIFY_URL = process.env.BACKEND_NOTIFY_URL
  || 'http://localhost:3000/api/violations/notify-realtime';

const QUEUE_NAME = 'violation_queue';
const CONNECT_MAX_RETRIES = 30;
const CONNECT_RETRY_DELAY_MS = 2000;
const DEDUP_WINDOW_SECONDS = 10;    // Bỏ qua message trùng trong 10s


// ============ HELPER: Đợi ============
const sleep = (ms) => new Promise(r => setTimeout(r, ms));


// ============ CONNECT VỚI RETRY ============
async function connectRabbitMQ() {
  for (let attempt = 1; attempt <= CONNECT_MAX_RETRIES; attempt++) {
    try {
      const connection = await amqp.connect(process.env.RABBITMQ_URL);
      const channel = await connection.createChannel();
      await channel.assertQueue(QUEUE_NAME, { durable: true });
      await channel.prefetch(1);
      console.log(`[*] Worker đã kết nối RabbitMQ (lần ${attempt})`);
      return { connection, channel };
    } catch (err) {
      console.error(`[!] Worker kết nối thất bại (lần ${attempt}/${CONNECT_MAX_RETRIES}): ${err.message}`);
      if (attempt === CONNECT_MAX_RETRIES) throw err;
      await sleep(CONNECT_RETRY_DELAY_MS);
    }
  }
}


// ============ XỬ LÝ MESSAGE ============
async function handleMessage(channel, msg) {
  const data = JSON.parse(msg.content.toString());
  const action = data.action || 'INSERT';

  console.log(
    `\n[x] Xử lý vi phạm | action=${action} | biển='${data.license_plate}'`
  );

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let violationId;
    let vehicleId;
    let eventName;

    if (action === 'UPDATE' && data.existing_violation_id) {
      // ============ UPDATE PATH ============
      violationId = data.existing_violation_id;

      const curRes = await client.query(
        'SELECT vehicle_id FROM Violations WHERE id = $1',
        [violationId]
      );

      if (curRes.rows.length === 0) {
        throw new Error(`Không tìm thấy violation ID=${violationId} để update`);
      }
      const oldVehicleId = curRes.rows[0].vehicle_id;

      const newPlate = data.license_plate;
      let finalVehicleId = oldVehicleId;

      if (newPlate && newPlate !== 'CHUA_RO_BS') {
        const existRes = await client.query(
          'SELECT id FROM Vehicles WHERE license_plate = $1',
          [newPlate]
        );

        if (existRes.rows.length > 0) {
          finalVehicleId = existRes.rows[0].id;
          console.log(`  [Vehicles] Biển '${newPlate}' đã tồn tại → dùng vehicle id=${finalVehicleId}`);
        } else {
          await client.query(
            'UPDATE Vehicles SET license_plate = $1 WHERE id = $2',
            [newPlate, oldVehicleId]
          );
          console.log(`  [Vehicles] Update biển '${newPlate}' vào vehicle id=${oldVehicleId}`);
        }
      }

      const extraInfo = {};
      if (data.light_status) extraInfo.light_status = data.light_status;
      if (data.confidence) extraInfo.confidence = data.confidence;

      await client.query(
        `UPDATE Violations
         SET vehicle_id = $1, violation_type = $2, extra_info = $3
         WHERE id = $4`,
        [finalVehicleId, data.violation_type, extraInfo, violationId]
      );

      if (data.panorama_image_path || data.license_plate_image_path) {
        const evRes = await client.query(
          'SELECT id FROM Evidences WHERE violation_id = $1',
          [violationId]
        );

        if (evRes.rows.length > 0) {
          await client.query(
            `UPDATE Evidences
             SET panorama_image_path = COALESCE($1, panorama_image_path),
                 license_plate_image_path = COALESCE($2, license_plate_image_path),
                 video_path = COALESCE($3, video_path)
             WHERE violation_id = $4`,
            [
              data.panorama_image_path,
              data.license_plate_image_path,
              data.video_path,
              violationId,
            ]
          );
          console.log(`  [Evidences] Đã cập nhật ảnh cho violation id=${violationId}`);
        } else {
          await client.query(
            `INSERT INTO Evidences
             (violation_id, panorama_image_path, license_plate_image_path, video_path)
             VALUES ($1, $2, $3, $4)`,
            [
              violationId,
              data.panorama_image_path,
              data.license_plate_image_path,
              data.video_path,
            ]
          );
        }
      }

      vehicleId = finalVehicleId;
      eventName = 'violation_updated';
      console.log(`  [Update] Đã cập nhật violation id=${violationId}`);

    } else {
      // ============ INSERT PATH ============
      // ✅ IDEMPOTENT: Kiểm tra message trùng trong DEDUP_WINDOW_SECONDS
      const dupCheck = await client.query(
        `SELECT v.id FROM Violations v
         JOIN Vehicles veh ON v.vehicle_id = veh.id
         WHERE veh.license_plate = $1
           AND v.violation_type = $2
           AND v.violation_time > NOW() - INTERVAL '${DEDUP_WINDOW_SECONDS} seconds'
         LIMIT 1`,
        [data.license_plate || '', data.violation_type]
      );

      if (dupCheck.rows.length > 0) {
        console.log(
          `  [Idempotent] ⏭️ Bỏ qua message trùng — violation id=${dupCheck.rows[0].id} đã tồn tại`
        );
        await client.query('COMMIT');
        channel.ack(msg);
        return;
      }

      const upsertVehicleQuery = `
        INSERT INTO Vehicles (license_plate, vehicle_type)
        VALUES ($1, $2)
        ON CONFLICT (license_plate)
        DO UPDATE SET vehicle_type = EXCLUDED.vehicle_type
        RETURNING id;
      `;
      const vehicleRes = await client.query(
        upsertVehicleQuery,
        [data.license_plate, data.vehicle_type]
      );
      vehicleId = vehicleRes.rows[0].id;

      const extraInfo = {};
      if (data.light_status) extraInfo.light_status = data.light_status;
      if (data.confidence) extraInfo.confidence = data.confidence;

      const insertViolationQuery = `
        INSERT INTO Violations (vehicle_id, violation_type, extra_info)
        VALUES ($1, $2, $3) RETURNING id;
      `;
      const violationRes = await client.query(insertViolationQuery, [
        vehicleId,
        data.violation_type,
        extraInfo,
      ]);
      violationId = violationRes.rows[0].id;

      const insertEvidenceQuery = `
        INSERT INTO Evidences
        (violation_id, panorama_image_path, license_plate_image_path, video_path)
        VALUES ($1, $2, $3, $4);
      `;
      await client.query(insertEvidenceQuery, [
        violationId,
        data.panorama_image_path,
        data.license_plate_image_path,
        data.video_path,
      ]);

      eventName = 'new_violation';
      console.log(`  [Insert] Đã tạo violation id=${violationId}`);
    }

    await client.query('COMMIT');
    channel.ack(msg);
    console.log(`[v] Đã lưu thành công xe '${data.license_plate}' vào PostgreSQL!`);

    // ============ NOTIFY FRONTEND ============
    data.id = violationId;
    data.violation_time = data.timestamp;
    data.event = eventName;

    try {
      await fetch(BACKEND_NOTIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } catch (fetchErr) {
      console.error('[!] Lỗi webhook realtime:', fetchErr.message);
    }

  } catch (dbError) {
    await client.query('ROLLBACK');
    console.error(`[!] Lỗi lưu xe '${data.license_plate}':`, dbError.message);
    // Requeue=false, mọi false → bỏ message (không retry vô hạn)
    channel.nack(msg, false, false);
  } finally {
    client.release();
  }
}


// ============ MAIN ============
async function startWorker() {
  try {
    const { connection, channel } = await connectRabbitMQ();

    console.log(`[*] Worker đang chờ dữ liệu từ queue '${QUEUE_NAME}'...`);

    channel.consume(QUEUE_NAME, async (msg) => {
      if (!msg) return;
      try {
        await handleMessage(channel, msg);
      } catch (err) {
        console.error('[!] Lỗi xử lý message:', err.message);
        try { channel.nack(msg, false, false); } catch (_) {}
      }
    }, { noAck: false });

    process.on('SIGINT', async () => {
      console.log('\n[*] Đang đóng kết nối an toàn...');
      try { await channel.close(); } catch (_) {}
      try { await connection.close(); } catch (_) {}
      try { await pool.end(); } catch (_) {}
      console.log('[*] Đã tắt Worker.');
      process.exit(0);
    });

  } catch (error) {
    console.error('[!] Không thể khởi động Worker sau nhiều lần thử:', error.message);
    process.exit(1);
  }
}

startWorker();