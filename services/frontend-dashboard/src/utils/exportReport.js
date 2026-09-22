/**
 * Module xuất báo cáo vi phạm (PDF + Excel).
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

const violationNameVN = (type) => {
  if (type === 'RED_LIGHT') return 'Vượt đèn đỏ';
  if (type === 'NO_HELMET') return 'Không đội mũ bảo hiểm';
  return type;
};

const statusVN = (status) => {
  if (status === 'Confirmed') return 'Đã xác nhận';
  return 'Chờ xử lý';
};


// ============ EXPORT PDF (dùng window.print) ============
export function exportToPDF(violations, stats = {}) {
  console.log('🚀 [exportToPDF] Dùng window.print() — code v3!');

  // ===== THỐNG KÊ =====
  const noHelmet = violations.filter(v => v.violation_type === 'NO_HELMET').length;
  const redLight = violations.filter(v => v.violation_type === 'RED_LIGHT').length;
  const confirmed = violations.filter(v => v.status === 'Confirmed').length;
  const now = new Date().toLocaleString('vi-VN');

  // ===== HTML ROWS =====
  const rowsHtml = violations.map((v, idx) => {
    const statusColor = v.status === 'Confirmed' ? '#059669' : '#d97706';
    return `
      <tr>
        <td style="text-align: center; padding: 8px; border: 1px solid #e5e7eb;">${idx + 1}</td>
        <td style="text-align: center; padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">
          ${v.license_plate || 'Chưa rõ'}
        </td>
        <td style="padding: 8px; border: 1px solid #e5e7eb;">${violationNameVN(v.violation_type)}</td>
        <td style="text-align: center; padding: 8px; border: 1px solid #e5e7eb;">${formatTime(v.violation_time)}</td>
        <td style="text-align: center; padding: 8px; border: 1px solid #e5e7eb; color: ${statusColor}; font-weight: 600;">
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
        <title>Báo cáo vi phạm giao thông</title>
        <style>
          @page { size: A4 landscape; margin: 12mm; }
          * { box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', 'Arial', 'Helvetica', sans-serif;
            color: #1f2937;
            margin: 0;
            padding: 10px;
          }
          h1 {
            color: #1e40af;
            text-align: center;
            margin: 0 0 5px;
            font-size: 22px;
            font-weight: 700;
          }
          .subtitle {
            text-align: center;
            color: #6b7280;
            font-size: 12px;
            margin-bottom: 20px;
          }
          .info {
            display: flex;
            justify-content: space-between;
            margin-bottom: 20px;
            font-size: 12px;
            border-top: 3px solid #1e40af;
            padding-top: 12px;
          }
          .info-col { width: 48%; }
          .info-col div { margin-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th {
            background: #2980b9;
            color: white;
            padding: 10px;
            border: 1px solid #1e40af;
            font-weight: 600;
          }
          td { padding: 8px; border: 1px solid #e5e7eb; }
          tr:nth-child(even) { background: #f9fafb; }
          .footer {
            text-align: center;
            font-size: 10px;
            color: #9ca3af;
            margin-top: 30px;
          }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <h1>BÁO CÁO VI PHẠM GIAO THÔNG</h1>
        <p class="subtitle">Hệ thống giám sát giao thông thông minh</p>

        <div class="info">
          <div class="info-col">
            <div><b>Ngày xuất báo cáo:</b> ${now}</div>
            <div><b>Tổng số vi phạm:</b> ${violations.length}</div>
            <div><b>Vi phạm hôm nay:</b> ${stats.today || 0}</div>
          </div>
          <div class="info-col">
            <div><b>Không đội mũ bảo hiểm:</b> ${noHelmet}</div>
            <div><b>Vượt đèn đỏ:</b> ${redLight}</div>
            <div><b>Đã xác nhận:</b> ${confirmed} &nbsp;|&nbsp; <b>Chờ xử lý:</b> ${violations.length - confirmed}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 50px;">STT</th>
              <th style="width: 130px;">Biển số</th>
              <th style="text-align: left;">Loại vi phạm</th>
              <th style="width: 160px;">Thời gian</th>
              <th style="width: 120px;">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="footer">--- Hết báo cáo ---</div>

        <script>
          // Auto trigger print khi load xong
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
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
    'Thời gian': formatTime(v.violation_time),
    'Trạng thái': statusVN(v.status),
    'Ảnh toàn cảnh': v.panorama_image_path || '',
    'Ảnh biển số': v.license_plate_image_path || '',
    'Video': v.video_path || '',
  }));

  const ws1 = XLSX.utils.json_to_sheet(violationRows);
  ws1['!cols'] = [
    { wch: 6 },   // STT
    { wch: 15 },  // Biển số
    { wch: 25 },  // Loại vi phạm
    { wch: 22 },  // Thời gian
    { wch: 15 },  // Trạng thái
    { wch: 40 },  // Ảnh toàn cảnh
    { wch: 40 },  // Ảnh biển số
    { wch: 40 },  // Video
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Danh sách vi phạm');

  // ===== SHEET 2: THỐNG KÊ =====
  const noHelmet = violations.filter(v => v.violation_type === 'NO_HELMET').length;
  const redLight = violations.filter(v => v.violation_type === 'RED_LIGHT').length;
  const confirmed = violations.filter(v => v.status === 'Confirmed').length;

  const statsRows = [
    { 'Chỉ số': 'Tổng số vi phạm', 'Giá trị': violations.length },
    { 'Chỉ số': 'Vi phạm hôm nay', 'Giá trị': stats.today || 0 },
    { 'Chỉ số': 'Không đội mũ bảo hiểm', 'Giá trị': noHelmet },
    { 'Chỉ số': 'Vượt đèn đỏ', 'Giá trị': redLight },
    { 'Chỉ số': 'Đã xác nhận', 'Giá trị': confirmed },
    { 'Chỉ số': 'Chờ xử lý', 'Giá trị': violations.length - confirmed },
    { 'Chỉ số': 'Thời gian xuất', 'Giá trị': new Date().toLocaleString('vi-VN') },
  ];

  const ws2 = XLSX.utils.json_to_sheet(statsRows);
  ws2['!cols'] = [{ wch: 30 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Thống kê');

  // ===== SHEET 3: TOP BIỂN SỐ =====
  const plateCounts = {};
  violations.forEach((v) => {
    const p = v.license_plate;
    if (!p || p === 'CHUA_RO_BS') return;
    plateCounts[p] = (plateCounts[p] || 0) + 1;
  });

  const topPlates = Object.entries(plateCounts)
    .map(([plate, count]) => ({ 'Biển số': plate, 'Số lần vi phạm': count }))
    .sort((a, b) => b['Số lần vi phạm'] - a['Số lần vi phạm']);

  if (topPlates.length > 0) {
    const ws3 = XLSX.utils.json_to_sheet(topPlates);
    ws3['!cols'] = [{ wch: 20 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Top biển số');
  }

  // ===== SAVE =====
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  XLSX.writeFile(wb, `bao-cao-vi-pham-${timestamp}.xlsx`);
}