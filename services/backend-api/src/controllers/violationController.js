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
    vehicle_id,
    vehicle_type,
    violation_type,
    light_status,
    confidence,

    // ✅ Thông tin mức phạt (từ Nghị định 168/2024/NĐ-CP)
    fine_min,
    fine_max,
    fine_text,
    legal_basis,
    session_id,

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

      // ✅ Mức phạt
      fine_min: parseInt(fine_min) || 0,
      fine_max: parseInt(fine_max) || 0,
      fine_text: fine_text || "",
      legal_basis: legal_basis || "",
      session_id: session_id || null,
    };

    if (violationData.fine_text) {
      console.log(
        `[Fine] Loại=${violation_type} → ${violationData.fine_text} ` +
        `(${violationData.legal_basis})`
      );
    }

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
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
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
        e.video_path,

        v.fine_min,
        v.fine_max,
        v.fine_text,
        v.legal_basis,
        v.session_id

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
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy dữ liệu'
    });
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
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy vi phạm'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Cập nhật trạng thái thành công',
      data: updateRes.rows[0]
    });

  } catch (error) {
    console.error('Lỗi khi cập nhật trạng thái:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server khi cập nhật'
    });
  }
};

const updateViolationVideo = async (req, res) => {
  const { vehicle_id } = req.body;

  if (!vehicle_id) {
    return res.status(400).json({
      success: false,
      message: 'Thiếu vehicle_id'
    });
  }

  if (!req.files || !req.files['violation_video']) {
    return res.status(400).json({
      success: false,
      message: 'Thiếu video'
    });
  }

  const video_path = '/uploads/' + req.files['violation_video'][0].filename;

  try {
    const findQuery = `
      SELECT v.id
      FROM Violations v
      WHERE v.id = (
        SELECT v2.id FROM Violations v2
        ORDER BY v2.id DESC
        LIMIT 1
      )
      OR v.id > (SELECT MAX(id) - 5 FROM Violations)
      ORDER BY v.id DESC
      LIMIT 1
    `;

    const updRes = await pool.query(`
      UPDATE Evidences
      SET video_path = $1
      WHERE id = (
        SELECT e.id FROM Evidences e
        JOIN Violations v ON e.violation_id = v.id
        WHERE e.video_path IS NULL
        ORDER BY v.violation_time DESC
        LIMIT 1
      )
      RETURNING id, violation_id
    `, [video_path]);

    if (updRes.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Không tìm thấy vi phạm cần update video' 
      });
    }

    console.log(
      `[UpdateVideo] Đã gắn video ${video_path} vào evidence id=${updRes.rows[0].id}`
    );

    const io = req.app.get('io');

    if (io) {
      io.emit('violation_video_ready', {
        violation_id: updRes.rows[0].violation_id,
        video_path: video_path,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Cập nhật video thành công',
      data: updRes.rows[0],
    });

  } catch (error) {
    console.error('Lỗi update video:', error);
    res.status(500).json({
      success: false,
      message: 'Lỗi server'
    });
  }
};

// ✅ Lấy tổng hợp theo session (video)
const getSessionSummary = async (req, res) => {
  const { session_id } = req.params;
  try {
    const query = `
      SELECT 
        v.session_id,
        COUNT(*) AS violation_count,
        SUM(v.fine_min) AS total_fine_min,
        SUM(v.fine_max) AS total_fine_max,
        MIN(v.violation_time) AS first_violation_time,
        MAX(v.violation_time) AS last_violation_time,
        array_agg(DISTINCT v.violation_type) AS violation_types,
        array_agg(DISTINCT veh.license_plate) FILTER (WHERE veh.license_plate IS NOT NULL AND veh.license_plate != '') AS license_plates
      FROM Violations v
      JOIN Vehicles veh ON v.vehicle_id = veh.id
      WHERE v.session_id = $1
      GROUP BY v.session_id;
    `;
    const result = await pool.query(query, [session_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Không tìm thấy session' 
      });
    }

    const row = result.rows[0];
    const fmt = (n) => parseInt(n).toLocaleString('vi-VN') + 'đ';

    res.status(200).json({
      success: true,
      data: {
        session_id: row.session_id,
        violation_count: parseInt(row.violation_count),
        total_fine_min: parseInt(row.total_fine_min),
        total_fine_max: parseInt(row.total_fine_max),
        total_fine_text: `${fmt(row.total_fine_min)} - ${fmt(row.total_fine_max)}`,
        first_violation_time: row.first_violation_time,
        last_violation_time: row.last_violation_time,
        violation_types: row.violation_types,
        license_plates: row.license_plates || [],
      }
    });
  } catch (error) {
    console.error('Lỗi lấy session summary:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ✅ Lấy danh sách tất cả sessions
const getAllSessions = async (req, res) => {
  try {
    const query = `
      SELECT 
        v.session_id,
        COUNT(*) AS violation_count,
        SUM(v.fine_min) AS total_fine_min,
        SUM(v.fine_max) AS total_fine_max,
        MAX(v.violation_time) AS last_violation_time,
        array_agg(DISTINCT v.violation_type) AS violation_types,
        array_agg(DISTINCT veh.license_plate) FILTER (
          WHERE veh.license_plate IS NOT NULL AND veh.license_plate != ''
        ) AS license_plates
      FROM Violations v
      JOIN Vehicles veh ON v.vehicle_id = veh.id
      WHERE v.session_id IS NOT NULL AND v.session_id != ''
      GROUP BY v.session_id
      ORDER BY MAX(v.violation_time) DESC;
    `;
    const result = await pool.query(query);

    const fmt = (n) => parseInt(n).toLocaleString('vi-VN') + 'đ';

    res.status(200).json({
      success: true,
      data: result.rows.map(r => ({
        session_id: r.session_id,
        violation_count: parseInt(r.violation_count),
        total_fine_min: parseInt(r.total_fine_min),
        total_fine_max: parseInt(r.total_fine_max),
        total_fine_text: `${fmt(r.total_fine_min)} - ${fmt(r.total_fine_max)}`,
        last_violation_time: r.last_violation_time,
        violation_types: r.violation_types || [],
        license_plates: r.license_plates || [],
      }))
    });
  } catch (error) {
    console.error('Lỗi lấy sessions:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};


// ✅ MỚI — Thống kê tổng quan (cho trang Quản lý phạt)
const getPenaltyOverview = async (req, res) => {
  try {
    // 1. Tổng quan
    const overview = await pool.query(`
      SELECT 
        COUNT(*) AS total_violations,
        COALESCE(SUM(v.fine_min), 0) AS total_fine_min,
        COALESCE(SUM(v.fine_max), 0) AS total_fine_max,
        COUNT(*) FILTER (WHERE v.status = 'Pending') AS pending_count,
        COUNT(*) FILTER (WHERE v.status = 'Confirmed') AS confirmed_count,
        COUNT(DISTINCT veh.license_plate) FILTER (
          WHERE veh.license_plate IS NOT NULL AND veh.license_plate != ''
        ) AS unique_vehicles
      FROM Violations v
      JOIN Vehicles veh ON v.vehicle_id = veh.id
    `);

    // 2. Thống kê theo loại vi phạm
    const byType = await pool.query(`
      SELECT 
        v.violation_type,
        COUNT(*) AS count,
        COALESCE(SUM(v.fine_min), 0) AS total_min,
        COALESCE(SUM(v.fine_max), 0) AS total_max
      FROM Violations v
      GROUP BY v.violation_type
      ORDER BY count DESC
    `);

    // 3. Thống kê theo ngày (7 ngày gần nhất)
    const byDay = await pool.query(`
      SELECT 
        DATE(v.violation_time) AS day,
        COUNT(*) AS count,
        COALESCE(SUM(v.fine_min), 0) AS total_min,
        COALESCE(SUM(v.fine_max), 0) AS total_max
      FROM Violations v
      WHERE v.violation_time > NOW() - INTERVAL '7 days'
      GROUP BY DATE(v.violation_time)
      ORDER BY day ASC
    `);

    const fmt = (n) => parseInt(n).toLocaleString('vi-VN') + 'đ';
    const o = overview.rows[0];

    res.status(200).json({
      success: true,
      data: {
        overview: {
          total_violations: parseInt(o.total_violations),
          total_fine_min: parseInt(o.total_fine_min),
          total_fine_max: parseInt(o.total_fine_max),
          total_fine_text: `${fmt(o.total_fine_min)} - ${fmt(o.total_fine_max)}`,
          pending_count: parseInt(o.pending_count),
          confirmed_count: parseInt(o.confirmed_count),
          unique_vehicles: parseInt(o.unique_vehicles),
        },
        by_type: byType.rows.map(r => ({
          violation_type: r.violation_type,
          count: parseInt(r.count),
          total_min: parseInt(r.total_min),
          total_max: parseInt(r.total_max),
          total_text: `${fmt(r.total_min)} - ${fmt(r.total_max)}`,
        })),
        by_day: byDay.rows.map(r => ({
          day: r.day,
          count: parseInt(r.count),
          total_min: parseInt(r.total_min),
          total_max: parseInt(r.total_max),
        })),
      }
    });
  } catch (error) {
    console.error('Lỗi lấy penalty overview:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

// ✅ MỚI — Top xe vi phạm nhiều
const getTopViolators = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const result = await pool.query(`
      SELECT 
        veh.license_plate,
        veh.vehicle_type,
        COUNT(*) AS violation_count,
        COALESCE(SUM(v.fine_min), 0) AS total_min,
        COALESCE(SUM(v.fine_max), 0) AS total_max,
        array_agg(DISTINCT v.violation_type) AS violation_types,
        MAX(v.violation_time) AS last_violation_time
      FROM Violations v
      JOIN Vehicles veh ON v.vehicle_id = veh.id
      WHERE veh.license_plate IS NOT NULL AND veh.license_plate != ''
      GROUP BY veh.license_plate, veh.vehicle_type
      ORDER BY violation_count DESC, total_max DESC
      LIMIT $1
    `, [limit]);

    const fmt = (n) => parseInt(n).toLocaleString('vi-VN') + 'đ';

    res.status(200).json({
      success: true,
      data: result.rows.map(r => ({
        license_plate: r.license_plate,
        vehicle_type: r.vehicle_type,
        violation_count: parseInt(r.violation_count),
        total_min: parseInt(r.total_min),
        total_max: parseInt(r.total_max),
        total_text: `${fmt(r.total_min)} - ${fmt(r.total_max)}`,
        violation_types: r.violation_types || [],
        last_violation_time: r.last_violation_time,
      }))
    });
  } catch (error) {
    console.error('Lỗi lấy top violators:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};


module.exports = {
  createViolation,
  getViolations,
  updateStatus,
  updateViolationVideo,
  getSessionSummary,
  getAllSessions,
  getPenaltyOverview,   // ✅ MỚI
  getTopViolators,      // ✅ MỚI
};