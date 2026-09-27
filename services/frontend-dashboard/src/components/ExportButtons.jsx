import React, { useState } from 'react';
import { exportToPDF, exportToExcel } from '../utils/exportReport';

const ExportButtons = ({ violations, stats }) => {
  const [exporting, setExporting] = useState(null);

  const handleExportPDF = async () => {
    if (!violations || violations.length === 0) {
      alert('Chưa có dữ liệu vi phạm để xuất!');
      return;
    }
    setExporting('pdf');
    try {
      // Delay nhỏ để UI kịp update state
      await new Promise((r) => setTimeout(r, 100));
      exportToPDF(violations, stats);
    } catch (err) {
      console.error('Lỗi xuất PDF:', err);
      alert('Lỗi khi xuất PDF: ' + err.message);
    } finally {
      setExporting(null);
    }
  };

  const handleExportExcel = async () => {
    if (!violations || violations.length === 0) {
      alert('Chưa có dữ liệu vi phạm để xuất!');
      return;
    }
    setExporting('excel');
    try {
      await new Promise((r) => setTimeout(r, 100));
      exportToExcel(violations, stats);
    } catch (err) {
      console.error('Lỗi xuất Excel:', err);
      alert('Lỗi khi xuất Excel: ' + err.message);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex flex-wrap gap-2 w-full sm:w-auto">
      <button
        onClick={handleExportPDF}
        disabled={exporting !== null}
        className="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-sm w-full sm:w-auto flex-1 sm:flex-none"
      >
        {exporting === 'pdf' ? (
          <>
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Đang xuất...
          </>
        ) : (
          <>
            <span>📄</span> Xuất PDF
          </>
        )}
      </button>

      <button
        onClick={handleExportExcel}
        disabled={exporting !== null}
        className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-sm w-full sm:w-auto flex-1 sm:flex-none"
      >
        {exporting === 'excel' ? (
          <>
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Đang xuất...
          </>
        ) : (
          <>
            <span>📊</span> Xuất Excel
          </>
        )}
      </button>
    </div>
  );
};

export default ExportButtons;