import React, { useEffect } from 'react';

const ViolationDetailModal = ({ violation, onClose }) => {
  // Đóng modal khi nhấn ESC
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';   // Ngăn scroll body
    
    return () => {
      window.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  if (!violation) return null;

  // Format helper
  const formatTime = (iso) => {
    if (!iso) return 'N/A';
    try {
      const d = new Date(iso);
      return d.toLocaleString('vi-VN');
    } catch {
      return iso;
    }
  };

  const violationNameVN = violation.violation_type === 'RED_LIGHT'
    ? 'VƯỢT ĐÈN ĐỎ'
    : violation.violation_type === 'NO_HELMET'
      ? 'KHÔNG ĐỘI MŨ BẢO HIỂM'
      : violation.violation_type;

  return (
    // Overlay
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Modal box — Responsive width và tự scroll bên trong */}
      <div
        className="bg-white rounded-lg shadow-xl w-[95%] sm:w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ===== HEADER ===== */}
        <div className="flex justify-between items-center p-4 border-b bg-gray-50 rounded-t-lg shrink-0">
          <h2 className="text-lg sm:text-xl font-bold text-gray-800 truncate pr-2">
            Chi tiết vi phạm #{violation.id}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 transition shrink-0"
            aria-label="Đóng"
          >
            ×
          </button>
        </div>

        {/* ===== BODY (scrollable) ===== */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1">
          {/* Info grid: 1 cột trên mobile, 2 cột trên sm+ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-5">
            <div>
              <p className="text-xs sm:text-sm text-gray-500 mb-1">Biển số xe</p>
              <p className="text-base sm:text-lg font-bold text-red-600">
                {violation.license_plate || 'CHƯA RÕ BIỂN SỐ'}
              </p>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-gray-500 mb-1">Thời gian</p>
              <p className="text-sm sm:text-base font-medium text-gray-800">
                {formatTime(violation.violation_time)}
              </p>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-gray-500 mb-1">Loại lỗi</p>
              <p className="text-sm sm:text-base font-semibold text-red-600">
                {violationNameVN}
              </p>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-gray-500 mb-1">Trạng thái</p>
              <span
                className={`inline-block px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${
                  violation.status === 'Confirmed'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}
              >
                {violation.status === 'Confirmed' ? 'Đã xác nhận' : 'Chờ xử lý'}
              </span>
            </div>
          </div>

          {/* ===== VIDEO ===== */}
          {violation.video_path && (
            <div className="mb-5">
              <p className="text-sm font-medium text-gray-700 mb-2">
                🎥 Video vi phạm
              </p>
              <div className="bg-black rounded-lg overflow-hidden flex justify-center">
                <video
                  controls
                  preload="metadata"
                  playsInline
                  className="w-full h-auto object-contain"
                  style={{
                    maxHeight: '40vh',
                    minHeight: '200px'
                  }}
                >
                  <source
                    src={`http://localhost:3000${violation.video_path}`}
                    type="video/mp4"
                  />
                  Trình duyệt không hỗ trợ video.
                </video>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Video ghi tự động 5 giây quanh thời điểm vi phạm
              </p>
            </div>
          )}

          {/* ===== ẢNH PANORAMA ===== */}
          {violation.panorama_image_path && (
            <div className="mb-5">
              <p className="text-sm font-medium text-gray-700 mb-2">
                📸 Ảnh toàn cảnh
              </p>
              <div className="bg-gray-100 rounded-lg overflow-hidden flex justify-center">
                <img
                  src={`http://localhost:3000${violation.panorama_image_path}`}
                  alt="Ảnh toàn cảnh"
                  className="w-full h-auto object-contain"
                  style={{ maxHeight: '35vh' }}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    console.error('Lỗi load ảnh panorama:', violation.panorama_image_path);
                  }}
                />
              </div>
            </div>
          )}

          {/* ===== ẢNH BIỂN SỐ ===== */}
          {violation.license_plate_image_path && (
            <div className="mb-2">
              <p className="text-sm font-medium text-gray-700 mb-2">
                🔍 Ảnh biển số
              </p>
              <div className="bg-gray-100 rounded-lg overflow-hidden flex justify-center p-2">
                <img
                  src={`http://localhost:3000${violation.license_plate_image_path}`}
                  alt="Ảnh biển số"
                  className="w-auto h-auto object-contain"
                  style={{
                    maxHeight: '180px',
                    maxWidth: '100%',
                  }}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    console.error('Lỗi load ảnh LP:', violation.license_plate_image_path);
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ===== FOOTER ===== */}
        <div className="flex justify-end gap-2 p-4 border-t bg-gray-50 rounded-b-lg shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition font-medium text-sm sm:text-base"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

export default ViolationDetailModal;