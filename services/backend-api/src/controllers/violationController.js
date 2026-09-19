const { Pool } = require('pg');
const { publishViolation } = require('../services/rabbitmqService');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Cửa sổ dedup — cùng loại vi phạm trong khoảng này = 1 bản ghi
const DEDUP_WINDOW_SECONDS = 60;


/**
 * Controller nhận POST từ AI.
 * Logic:
 *  - Nếu biển số RỖNG hoặc 'CHUA_RO_BS' → INSERT mới
 *  - Nếu biển số CÓ → check DB xem có vi phạm nào cùng loại trong 60s qua không:
 *      + Có → UPDATE (ghi đè biển số + ảnh)
 *      + Không → INSERT mới
 *  - Gửi flag action vào queue để Worker biết phải làm gì
 */
const createViolation = async (req, res) => {
  const {
    license_plate,
    vehicle_id,           // track_id từ AI (nếu gửi)
    vehicle_type,
    violation_type,
    light_status,
    confidence,
  } = req.body;

  const panorama_image_path = req.files && req.files['panorama_image']
    ? '/uploads/' + req.files['panorama_image'][0].filename
    : null;

  const license_plate_image_path = req.files && req.files['license_plate_image']
    ? '/uploads/' + req.files['license_plate_image'][0].filename
    : null;

  const video_path = req.files && req.files['violation_video']
    ? '/uploads/' + req.files['violation_video'][0].filename
    : null;

  try {
    // ============ DEDUP ============
    let action = 'INSERT';
    let existingViolationId = null;

    const hasRealPlate = license_plate
      && license_plate.trim() !== ''
      && license_plate !== 'CHUA_RO_BS';

    if (hasRealPlate) {
      // Tìm vi phạm gần đây cùng loại, có biển rỗng hoặc cùng biển
      const dedupQuery = `
        SELECT v.id, veh.license_plate AS existing_plate
        FROM Violations v
        JOIN Vehicles veh ON v.vehicle_id = veh.id
        WHERE v.violation_type = $1
          AND v.violation_time > NOW() - INTERVAL '${DEDUP_WINDOW_SECONDS} seconds'
          AND (
            veh.license_plate = $2
            OR veh.license_plate IS NULL
            OR veh.license_plate = ''
            OR veh.license_plate = 'CHUA_RO_BS'
          )
        ORDER BY v.violation_time DESC
        LIMIT 1
      `;

      const dup = await pool.query(dedupQuery, [violation_type, license_plate]);

      if (dup.rows.length > 0) {
        action = 'UPDATE';
        existingViolationId = dup.rows[0].id;
        console.log(
          `[Dedup] Tìm thấy vi phạm ID=${existingViolationId} ` +
          `(biển cũ='${dup.rows[0].existing_plate}') → action=UPDATE`
        );
      }
    }

    const violationData = {
      action,
      existing_violation_id: existingViolationId,

      license_plate,
      vehicle_id: vehicle_id || null,
      vehicle_type,
      violation_type,
      light_status,
      confidence,
      panorama_image_path,
      license_plate_image_path,
      video_path,
      timestamp: new Date().toISOString(),
    };

    await publishViolation(violationData);

    const httpStatus = action === 'UPDATE' ? 200 : 202;
    res.status(httpStatus).json({
      success: true,
      action,
      existing_id: existingViolationId,
      message: action === 'UPDATE'
        ? `Đã cập nhật vi phạm ID=${existingViolationId}`
        : 'Dữ liệu đã được đưa vào hàng đợi xử lý',
      data: violationData,
    });

  } catch (error) {
    console.error('Lỗi khi xử lý dữ liệu:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};


const getViolations = async (req, res) => {
  try {
    const query = `
      SELECT 
        v.id, 
        veh.license_plate, 
        veh.vehicle_type, 
        v.violation_type, 
        v.violation_time, 
        v.status, 
        v.extra_info, 
        e.panorama_image_path, 
        e.license_plate_image_path,
        e.video_path
      FROM Violations v
      JOIN Vehicles veh ON v.vehicle_id = veh.id
      LEFT JOIN Evidences e ON v.id = e.violation_id
      ORDER BY v.violation_time DESC;
    `;
    const result = await pool.query(query);

    res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Lỗi khi lấy danh sách vi phạm:', error);
    res.status(500).json({ success: false, message: 'Lỗi server khi lấy dữ liệu' });
  }
};


const updateStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const updateRes = await pool.query(
      'UPDATE Violations SET status = $1 WHERE id = $2 RETURNING id, status',
      [status, id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy vi phạm' });
    }

    res.status(200).json({
      success: true,
      message: 'Cập nhật trạng thái thành công',
      data: updateRes.rows[0]
    });
  } catch (error) {
    console.error('Lỗi khi cập nhật trạng thái:', error);
    res.status(500).json({ success: false, message: 'Lỗi server khi cập nhật' });
  }
};


module.exports = {
  createViolation,
  getViolations,
  updateStatus
};