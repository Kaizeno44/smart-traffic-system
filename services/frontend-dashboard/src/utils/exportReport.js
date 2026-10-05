/**
 * Module xuất báo cáo vi phạm (PDF + Excel).
 * - PDF: dùng window.print() với HTML/CSS đẹp (không cần lib nặng)
 * - Excel: dùng XLSX với 3 sheet
 */
import * as XLSX from 'xlsx';


// ============ HELPERS ============
const formatTime = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
};

const formatDate = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return iso;
  }
};

const violationNameVN = (type) => {
  if (type === 'RED_LIGHT') return 'Vượt đèn đỏ';
  if (type === 'NO_HELMET') return 'Không đội mũ bảo hiểm';
  if (type === 'OVERLOAD') return 'Chở quá số người';
  if (type === 'PHONE_USE') return 'Dùng điện thoại';
  if (type === 'WHEELIE') return 'Bốc đầu';
  if (type === 'ZIGZAG') return 'Lạng lách';
  return type;
};

const statusVN = (status) => {
  if (status === 'Confirmed') return 'Đã xác nhận';
  return 'Chờ xử lý';
};

// ✅ MỚI — Format mức phạt từ fine_min/fine_max hoặc dùng fine_text có sẵn
const formatFine = (v) => {
  if (v.fine_text && v.fine_text.trim() !== '') return v.fine_text;
  const min = parseInt(v.fine_min) || 0;
  const max = parseInt(v.fine_max) || 0;
  if (min === 0 && max === 0) return '—';
  const fmt = (n) => n.toLocaleString('vi-VN') + 'đ';
  if (min === max) return fmt(min);
  return `${fmt(min)} - ${fmt(max)}`;
};

// ✅ MỚI — Tính tổng tiền phạt từ danh sách vi phạm
const calcTotalFine = (violations) => {
  let totalMin = 0;
  let totalMax = 0;
  violations.forEach((v) => {
    totalMin += parseInt(v.fine_min) || 0;
    totalMax += parseInt(v.fine_max) || 0;
  });
  return { totalMin, totalMax };
};

const formatMoney = (n) => {
  return n.toLocaleString('vi-VN') + 'đ';
};


// ============ EXPORT PDF (dùng window.print) ============
export function exportToPDF(violations, stats = {}) {
  console.log('🚀 [exportToPDF] Code v4 — có mức phạt + tổng tiền!');

  // ===== THỐNG KÊ =====
  const noHelmet = violations.filter(v => v.violation_type === 'NO_HELMET').length;
  const redLight = violations.filter(v => v.violation_type === 'RED_LIGHT').length;
  const overload = violations.filter(v => v.violation_type === 'OVERLOAD').length;
  const confirmed = violations.filter(v => v.status === 'Confirmed').length;
  const pending = violations.length - confirmed;

  const uniqueVehicles = new Set(
    violations
      .map(v => v.license_plate)
      .filter(p => p && p !== 'CHUA_RO_BS')
  ).size;

  const uniqueSessions = new Set(
    violations
      .map(v => v.session_id)
      .filter(s => s)
  ).size;

  const { totalMin, totalMax } = calcTotalFine(violations);
  const totalFineText = (totalMin === 0 && totalMax === 0)
    ? 'Chưa có dữ liệu'
    : (totalMin === totalMax ? formatMoney(totalMin) : `${formatMoney(totalMin)} - ${formatMoney(totalMax)}`);

  const now = new Date().toLocaleString('vi-VN');
  const nowDate = new Date().toLocaleDateString('vi-VN');

  // ===== HTML ROWS =====
  const rowsHtml = violations.map((v, idx) => {
    const statusColor = v.status === 'Confirmed' ? '#059669' : '#d97706';
    const fineText = formatFine(v);
    const isZero = fineText === '—';
    return `
      <tr>
        <td style="text-align: center; padding: 6px; border: 1px solid #e5e7eb;">${idx + 1}</td>
        <td style="text-align: center; padding: 6px; border: 1px solid #e5e7eb; font-weight: bold; color: #b91c1c;">
          ${v.license_plate || '<i style="color:#9ca3af;">Chưa rõ</i>'}
        </td>
        <td style="padding: 6px; border: 1px solid #e5e7eb;">${violationNameVN(v.violation_type)}</td>
        <td style="text-align: right; padding: 6px; border: 1px solid #e5e7eb; font-weight: 600; color: ${isZero ? '#9ca3af' : '#b91c1c'};">
          ${fineText}
        </td>
        <td style="padding: 6px; border: 1px solid #e5e7eb; font-size: 10px; color: #6b7280; font-style: italic;">
          ${v.legal_basis || '—'}
        </td>
        <td style="text-align: center; padding: 6px; border: 1px solid #e5e7eb; font-size: 10px;">
          ${formatTime(v.violation_time)}
        </td>
        <td style="text-align: center; padding: 6px; border: 1px solid #e5e7eb; color: ${statusColor}; font-weight: 600;">
          ${statusVN(v.status)}
        </td>
      </tr>
    `;
  }).join('');

  // ===== FULL HTML =====
  const html = `
    <!DOCTYPE html>
    <html lang="vi">
      <head>
        <meta charset="UTF-8">
        <title>Báo cáo vi phạm giao thông - ${nowDate}</title>
        <style>
          @page { size: A4 landscape; margin: 10mm; }
          * { box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', 'Arial', 'Helvetica', sans-serif;
            color: #1f2937;
            margin: 0;
            padding: 10px;
            font-size: 12px;
          }
          /* ==== HEADER ==== */
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 3px solid #1e40af;
            padding-bottom: 12px;
            margin-bottom: 16px;
          }
          .header-left {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .logo {
            width: 50px;
            height: 50px;
            background: linear-gradient(135deg, #1e40af, #3b82f6);
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 24px;
            font-weight: bold;
          }
          .brand-name {
            font-size: 16px;
            font-weight: 700;
            color: #1e40af;
            margin: 0;
          }
          .brand-sub {
            font-size: 11px;
            color: #6b7280;
            margin: 2px 0 0;
          }
          .header-right {
            text-align: right;
            font-size: 10px;
            color: #6b7280;
          }
          .header-right div { margin-bottom: 2px; }

          /* ==== TITLE ==== */
          h1 {
            color: #1e40af;
            text-align: center;
            margin: 16px 0 4px;
            font-size: 22px;
            font-weight: 800;
            letter-spacing: 0.5px;
          }
          .subtitle {
            text-align: center;
            color: #6b7280;
            font-size: 12px;
            margin-bottom: 20px;
            font-style: italic;
          }

          /* ==== SUMMARY BOXES ==== */
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
            margin-bottom: 20px;
          }
          .summary-card {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 10px 12px;
            background: #f9fafb;
          }
          .summary-card .label {
            font-size: 10px;
            color: #6b7280;
            text-transform: uppercase;
            font-weight: 600;
            margin-bottom: 4px;
          }
          .summary-card .value {
            font-size: 20px;
            font-weight: 800;
            color: #1e40af;
          }
          .summary-card.total-fine .value {
            font-size: 14px;
            color: #b91c1c;
          }
          .summary-card.pending .value { color: #d97706; }
          .summary-card.confirmed .value { color: #059669; }

          /* ==== DETAIL INFO ==== */
          .info-line {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: #4b5563;
            padding: 8px 0;
            border-top: 1px solid #e5e7eb;
            border-bottom: 1px solid #e5e7eb;
            margin-bottom: 16px;
          }
          .info-line span { margin-right: 16px; }

          /* ==== TABLE ==== */
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            margin-bottom: 16px;
          }
          th {
            background: #1e40af;
            color: white;
            padding: 8px 6px;
            border: 1px solid #1e40af;
            font-weight: 600;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          }
          td { padding: 6px; border: 1px solid #e5e7eb; vertical-align: middle; }
          tr:nth-child(even) { background: #f9fafb; }

          /* ==== FOOTER ==== */
          .signature {
            display: flex;
            justify-content: space-around;
            margin-top: 30px;
            padding-top: 16px;
            border-top: 1px dashed #d1d5db;
          }
          .signature-box {
            text-align: center;
            width: 40%;
          }
          .signature-box .role {
            font-weight: 600;
            font-size: 11px;
            margin-bottom: 4px;
          }
          .signature-box .note {
            font-size: 10px;
            color: #6b7280;
            font-style: italic;
            margin-bottom: 50px;
          }
          .signature-box .line {
            border-top: 1px dotted #9ca3af;
            padding-top: 4px;
            font-size: 10px;
            color: #9ca3af;
          }
          .footer {
            text-align: center;
            font-size: 9px;
            color: #9ca3af;
            margin-top: 20px;
          }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <!-- HEADER -->
        <div class="header">
          <div class="header-left">
            <div class="logo">🚦</div>
            <div>
              <p class="brand-name">SMART TRAFFIC AI</p>
              <p class="brand-sub">Hệ thống giám sát giao thông thông minh</p>
            </div>
          </div>
          <div class="header-right">
            <div><b>Mã báo cáo:</b> BC-${Date.now().toString().slice(-8)}</div>
            <div><b>Ngày xuất:</b> ${now}</div>
            <div><b>Trang:</b> 1</div>
          </div>
        </div>

        <!-- TITLE -->
        <h1>BÁO CÁO VI PHẠM GIAO THÔNG</h1>
        <p class="subtitle">Kỳ báo cáo: ${nowDate}</p>

        <!-- SUMMARY CARDS -->
        <div class="summary-grid">
          <div class="summary-card">
            <div class="label">Tổng vi phạm</div>
            <div class="value">${violations.length}</div>
          </div>
          <div class="summary-card total-fine">
            <div class="label">Tổng tiền phạt</div>
            <div class="value">${totalFineText}</div>
          </div>
          <div class="summary-card pending">
            <div class="label">Chờ xử lý</div>
            <div class="value">${pending}</div>
          </div>
          <div class="summary-card confirmed">
            <div class="label">Đã xác nhận</div>
            <div class="value">${confirmed}</div>
          </div>
        </div>

        <!-- DETAIL INFO -->
        <div class="info-line">
          <div>
            <span>🚗 <b>Xe vi phạm:</b> ${uniqueVehicles}</span>
            <span>📹 <b>Phiên upload:</b> ${uniqueSessions}</span>
            <span>🪖 <b>Không mũ:</b> ${noHelmet}</span>
            <span>🚦 <b>Vượt đèn đỏ:</b> ${redLight}</span>
            ${overload > 0 ? `<span>👥 <b>Chở quá người:</b> ${overload}</span>` : ''}
          </div>
        </div>

        <!-- TABLE -->
        <table>
          <thead>
            <tr>
              <th style="width: 40px;">STT</th>
              <th style="width: 110px;">Biển số</th>
              <th style="width: 140px;">Loại vi phạm</th>
              <th style="width: 150px;">Mức phạt</th>
              <th>Căn cứ pháp lý</th>
              <th style="width: 130px;">Thời gian</th>
              <th style="width: 90px;">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <!-- FOOTER SUMMARY -->
        <div style="background: #fef2f2; border-left: 4px solid #b91c1c; padding: 10px 14px; margin-bottom: 20px;">
          <div style="font-size: 11px; color: #6b7280; text-transform: uppercase; font-weight: 600; margin-bottom: 4px;">
            💰 Tổng tiền phạt ước tính
          </div>
          <div style="font-size: 18px; font-weight: 800; color: #b91c1c;">
            ${totalFineText}
          </div>
          <div style="font-size: 10px; color: #6b7280; margin-top: 4px; font-style: italic;">
            * Mức phạt theo Nghị định 168/2024/NĐ-CP. Số tiền thực tế có thể thay đổi tùy tình tiết cụ thể.
          </div>
        </div>

        <!-- SIGNATURE -->
        <div class="signature">
          <div class="signature-box">
            <div class="role">Người lập báo cáo</div>
            <div class="note">(Ký, ghi rõ họ tên)</div>
            <div class="line">................................</div>
          </div>
          <div class="signature-box">
            <div class="role">Xác nhận của cấp trên</div>
            <div class="note">(Ký, ghi rõ họ tên)</div>
            <div class="line">................................</div>
          </div>
        </div>

        <div class="footer">--- Hết báo cáo ---</div>

        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 300);
          };
        </script>
      </body>
    </html>
  `;

  // ===== MỞ WINDOW MỚI VÀ IN =====
  const printWindow = window.open('', '_blank', 'width=1200,height=800');

  if (!printWindow) {
    alert('Vui lòng cho phép popup để xuất PDF!');
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}


// ============ EXPORT EXCEL ============
export function exportToExcel(violations, stats = {}) {
  const wb = XLSX.utils.book_new();

  // ===== SHEET 1: DANH SÁCH VI PHẠM =====
  const violationRows = violations.map((v, idx) => ({
    'STT': idx + 1,
    'Biển số': v.license_plate || 'Chưa rõ',
    'Loại vi phạm': violationNameVN(v.violation_type),
    'Mức phạt': formatFine(v),
    'Căn cứ pháp lý': v.legal_basis || '',
    'Thời gian': formatTime(v.violation_time),
    'Trạng thái': statusVN(v.status),
    'Phiên (session)': v.session_id || '',
    'Ảnh toàn cảnh': v.panorama_image_path || '',
    'Ảnh biển số': v.license_plate_image_path || '',
    'Video': v.video_path || '',
  }));

  const ws1 = XLSX.utils.json_to_sheet(violationRows);
  ws1['!cols'] = [
    { wch: 6 },   // STT
    { wch: 15 },  // Biển số
    { wch: 25 },  // Loại vi phạm
    { wch: 25 },  // Mức phạt
    { wch: 45 },  // Căn cứ PL
    { wch: 22 },  // Thời gian
    { wch: 15 },  // Trạng thái
    { wch: 35 },  // Session
    { wch: 40 },  // Ảnh toàn cảnh
    { wch: 40 },  // Ảnh biển số
    { wch: 40 },  // Video
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Danh sách vi phạm');

  // ===== SHEET 2: THỐNG KÊ =====
  const noHelmet = violations.filter(v => v.violation_type === 'NO_HELMET').length;
  const redLight = violations.filter(v => v.violation_type === 'RED_LIGHT').length;
  const overload = violations.filter(v => v.violation_type === 'OVERLOAD').length;
  const confirmed = violations.filter(v => v.status === 'Confirmed').length;

  const uniqueVehicles = new Set(
    violations
      .map(v => v.license_plate)
      .filter(p => p && p !== 'CHUA_RO_BS')
  ).size;

  const uniqueSessions = new Set(
    violations
      .map(v => v.session_id)
      .filter(s => s)
  ).size;

  const { totalMin, totalMax } = calcTotalFine(violations);

  const statsRows = [
    { 'Chỉ số': 'Tổng số vi phạm', 'Giá trị': violations.length },
    { 'Chỉ số': 'Vi phạm hôm nay', 'Giá trị': stats.today || 0 },
    { 'Chỉ số': 'Số xe vi phạm (unique)', 'Giá trị': uniqueVehicles },
    { 'Chỉ số': 'Số phiên upload', 'Giá trị': uniqueSessions },
    { 'Chỉ số': '', 'Giá trị': '' },
    { 'Chỉ số': 'Không đội mũ bảo hiểm', 'Giá trị': noHelmet },
    { 'Chỉ số': 'Vượt đèn đỏ', 'Giá trị': redLight },
    { 'Chỉ số': 'Chở quá số người', 'Giá trị': overload },
    { 'Chỉ số': '', 'Giá trị': '' },
    { 'Chỉ số': 'Đã xác nhận', 'Giá trị': confirmed },
    { 'Chỉ số': 'Chờ xử lý', 'Giá trị': violations.length - confirmed },
    { 'Chỉ số': '', 'Giá trị': '' },
    { 'Chỉ số': 'Tổng tiền phạt (min)', 'Giá trị': totalMin },
    { 'Chỉ số': 'Tổng tiền phạt (max)', 'Giá trị': totalMax },
    { 'Chỉ số': 'Tổng tiền phạt (text)', 'Giá trị': (totalMin === totalMax ? formatMoney(totalMin) : `${formatMoney(totalMin)} - ${formatMoney(totalMax)}`) },
    { 'Chỉ số': '', 'Giá trị': '' },
    { 'Chỉ số': 'Thời gian xuất', 'Giá trị': new Date().toLocaleString('vi-VN') },
    { 'Chỉ số': 'Căn cứ pháp lý', 'Giá trị': 'Nghị định 168/2024/NĐ-CP' },
  ];

  const ws2 = XLSX.utils.json_to_sheet(statsRows);
  ws2['!cols'] = [{ wch: 30 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Thống kê');

  // ===== SHEET 3: TOP BIỂN SỐ =====
  const plateStats = {};
  violations.forEach((v) => {
    const p = v.license_plate;
    if (!p || p === 'CHUA_RO_BS') return;
    if (!plateStats[p]) {
      plateStats[p] = { count: 0, totalMin: 0, totalMax: 0 };
    }
    plateStats[p].count += 1;
    plateStats[p].totalMin += parseInt(v.fine_min) || 0;
    plateStats[p].totalMax += parseInt(v.fine_max) || 0;
  });

  const topPlates = Object.entries(plateStats)
    .map(([plate, s]) => ({
      'Biển số': plate,
      'Số lần vi phạm': s.count,
      'Tổng phạt (min)': s.totalMin,
      'Tổng phạt (max)': s.totalMax,
      'Tổng phạt (text)': (s.totalMin === s.totalMax
        ? formatMoney(s.totalMin)
        : `${formatMoney(s.totalMin)} - ${formatMoney(s.totalMax)}`),
    }))
    .sort((a, b) => b['Số lần vi phạm'] - a['Số lần vi phạm']);

  if (topPlates.length > 0) {
    const ws3 = XLSX.utils.json_to_sheet(topPlates);
    ws3['!cols'] = [
      { wch: 20 },  // Biển số
      { wch: 15 },  // Số lần
      { wch: 18 },  // Min
      { wch: 18 },  // Max
      { wch: 30 },  // Text
    ];
    XLSX.utils.book_append_sheet(wb, ws3, 'Top biển số');
  }

  // ===== SHEET 4 (MỚI): THEO LOẠI VI PHẠM =====
  const byTypeStats = {};
  violations.forEach((v) => {
    const t = v.violation_type;
    if (!byTypeStats[t]) {
      byTypeStats[t] = { count: 0, totalMin: 0, totalMax: 0 };
    }
    byTypeStats[t].count += 1;
    byTypeStats[t].totalMin += parseInt(v.fine_min) || 0;
    byTypeStats[t].totalMax += parseInt(v.fine_max) || 0;
  });

  const byTypeRows = Object.entries(byTypeStats).map(([type, s]) => ({
    'Loại vi phạm': violationNameVN(type),
    'Số lần': s.count,
    'Tổng phạt (min)': s.totalMin,
    'Tổng phạt (max)': s.totalMax,
    'Tổng phạt (text)': (s.totalMin === s.totalMax
      ? formatMoney(s.totalMin)
      : `${formatMoney(s.totalMin)} - ${formatMoney(s.totalMax)}`),
  }));

  if (byTypeRows.length > 0) {
    const ws4 = XLSX.utils.json_to_sheet(byTypeRows);
    ws4['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws4, 'Theo loại vi phạm');
  }

  // ===== SAVE =====
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  XLSX.writeFile(wb, `bao-cao-vi-pham-${timestamp}.xlsx`);
}