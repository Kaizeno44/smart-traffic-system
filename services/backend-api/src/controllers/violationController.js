const { Pool } = require('pg');
const { publishViolation } = require('../services/rabbitmqService'); // Import hàm đẩy data

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const createViolation = async (req, res) => {
  const { license_plate, vehicle_type, violation_type } = req.body;

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
    // 1. Gom tất cả dữ liệu lại thành một object
    const violationData = {
      license_plate,
      vehicle_type,
      violation_type,
      panorama_image_path,
      license_plate_image_path,
      video_path,
      timestamp: new Date().toISOString()
    };

    // 2. Ném vào hàng đợi RabbitMQ thay vì lưu trực tiếp vào Database
    await publishViolation(violationData);

    // 3. Phản hồi ngay lập tức cho AI (Mã 202: Accepted - Đã tiếp nhận)
    res.status(202).json({
      success: true,
      message: 'Dữ liệu đã được đưa vào hàng đợi xử lý',
      data: violationData
    });

  } catch (error) {
    console.error('Lỗi khi xử lý dữ liệu:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
const getViolations = async (req, res) => {
  try {
    const query = `
      SELECT v.id, veh.license_plate, veh.vehicle_type, v.violation_type, v.violation_time, v.status, e.panorama_image_path, e.license_plate_image_path
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
// Hàm mới: Cập nhật trạng thái vi phạm
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