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
      {/* Modal box — có scroll */}
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ===== HEADER ===== */}
        <div className="flex justify-between items-center p-4 border-b bg-gray-50 rounded-t-lg">
          <h2 className="text-xl font-bold text-gray-800">
            Chi tiết vi phạm #{violation.id}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 transition"
            aria-label="Đóng"
          >
            ×
          </button>
        </div>

        {/* ===== BODY (scrollable) ===== */}
        <div className="p-5 overflow-y-auto flex-1">
          {/* Info grid */}
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div>
              <p className="text-sm text-gray-500 mb-1">Biển số xe</p>
              <p className="text-lg font-bold text-red-600">
                {violation.license_plate || 'CHƯA RÕ BIỂN SỐ'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Thời gian</p>
              <p className="text-base font-medium text-gray-800">
                {formatTime(violation.violation_time)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Loại lỗi</p>
              <p className="text-base font-semibold text-red-600">
                {violationNameVN}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Trạng thái</p>
              <span
                className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
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
                  className="w-full h-auto"
                  style={{
                    maxHeight: '320px',
                    objectFit: 'contain',
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
                  className="w-full h-auto"
                  style={{
                    maxHeight: '320px',
                    objectFit: 'contain',
                  }}
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
            <div className="mb-5">
              <p className="text-sm font-medium text-gray-700 mb-2">
                🔍 Ảnh biển số
              </p>
              <div className="bg-gray-100 rounded-lg overflow-hidden flex justify-center">
                <img
                  src={`http://localhost:3000${violation.license_plate_image_path}`}
                  alt="Ảnh biển số"
                  className="w-auto h-auto"
                  style={{
                    maxHeight: '180px',
                    maxWidth: '100%',
                    objectFit: 'contain',
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
        <div className="flex justify-end gap-2 p-4 border-t bg-gray-50 rounded-b-lg">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition font-medium"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

export default ViolationDetailModal;