import React from 'react';

// Ham chuan hoa loai xe
const formatVehicleType = (type) => {
  const map = {
    'motorbike': 'Xe may',
    'xe may': 'Xe may',
    'car': 'O to'
  };
  return map[type?.toLowerCase()] || type;
};

// Ham chuan hoa loi vi pham
const formatViolationError = (error) => {
  const map = {
    'no_helmet': 'KHONG DOI MU BAO HIEM',
    'red_light': 'VUOT DEN DO'
  };
  return map[error?.toLowerCase()] || error;
};

// Ham dinh dang thoi gian
const formatTime = (timeString) => {
  if (!timeString) return '';
  const date = new Date(timeString);
  const time = date.toLocaleTimeString('vi-VN', { hour12: false }); 
  const day = date.toLocaleDateString('vi-VN');
  return `${time} ${day}`;
};

// GỘP PROPS: Giữ processingId của bạn và onViewDetail của Hoang
const ViolationTable = ({ data = [], onConfirm, processingId, onViewDetail }) => {
  const BASE_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3000';

  const handleImageError = (e) => {
    e.target.src = 'https://via.placeholder.com/150x100?text=Loi+anh';
  };

  // Hàm xử lý đường dẫn ảnh an toàn của Hoang
  const getImageUrl = (path) => {
    if (!path) return 'https://via.placeholder.com/150x100?text=No+Image';
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    return `${BASE_URL}/${cleanPath}`;
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">ID</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">Bien so</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">Loai xe</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">Loi vi pham</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">Thoi gian</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">Trang thai</th>
            <th className="px-4 py-3 text-center font-medium text-gray-500 uppercase">Bang chung</th>
            <th className="px-4 py-3 text-center font-medium text-gray-500 uppercase">Thao tac</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50 items-center">
              <td className="px-4 py-4 text-gray-900">{row.id}</td>
              <td className="px-4 py-4 font-bold text-red-600">{row.license_plate}</td>
              <td className="px-4 py-4 text-gray-600">{formatVehicleType(row.vehicle_type)}</td>
              <td className="px-4 py-4">
                <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap">
                  {formatViolationError(row.violation_type)}
                </span>
              </td>
              <td className="px-4 py-4 text-gray-500">{formatTime(row.violation_time)}</td>
              <td className="px-4 py-4">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  row.status === 'Confirmed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {row.status}
                </span>
              </td>
              <td className="px-4 py-2 flex justify-center">
                {/* KẾT HỢP: Logic render video của bạn + helper function của Hoang */}
                {row.video_path ? (
                  <video 
                    src={getImageUrl(row.video_path)}
                    controls 
                    className="h-20 w-32 object-cover rounded border"
                  />
                ) : (
                  <img 
                    src={getImageUrl(row.panorama_image_path)} 
                    alt="Bang chung" 
                    className="h-16 w-24 object-cover rounded border"
                    onError={handleImageError}
                  />
                )}
              </td>
              
              <td className="px-4 py-4">
                <div className="flex justify-center gap-2">
                  {/* KẾT HỢP: Nút Chi tiết (Hoang) */}
                  <button 
                    onClick={() => onViewDetail && onViewDetail(row)}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-sm font-medium transition"
                  >
                    Chi tiết
                  </button>

                  {/* KẾT HỢP: Nút Xác nhận chỉ hiện khi Pending (Hoang) + Loading state (Bạn) */}
                  {row.status === 'Pending' && (
                    <button 
                      onClick={() => onConfirm(row.id)}
                      disabled={processingId === row.id}
                      className={`px-3 py-1.5 rounded text-sm font-medium transition text-white ${
                        processingId === row.id 
                          ? 'bg-gray-400 cursor-not-allowed' 
                          : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      {processingId === row.id ? 'Đang xử lý...' : 'Xác nhận'}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ViolationTable;