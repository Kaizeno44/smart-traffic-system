import React from 'react';

// Hàm chuẩn hóa loại xe
const formatVehicleType = (type) => {
  const map = {
    'motorbike': 'Xe máy',
    'xe may': 'Xe máy',
    'car': 'Ô tô'
  };
  return map[type?.toLowerCase()] || type;
};

// Hàm chuẩn hóa lỗi vi phạm
const formatViolationError = (error) => {
  const map = {
    'no_helmet': 'KHÔNG ĐỘI MŨ BẢO HIỂM',
    'red_light': 'VƯỢT ĐÈN ĐỎ'
  };
  return map[error?.toLowerCase()] || error;
};

// Hàm định dạng thời gian từ chuỗi ISO sang định dạng giống ảnh (HH:MM:SS DD/MM/YYYY)
const formatTime = (timeString) => {
  if (!timeString) return '';
  const date = new Date(timeString);
  // Sử dụng múi giờ Việt Nam
  const time = date.toLocaleTimeString('vi-VN', { hour12: false }); 
  const day = date.toLocaleDateString('vi-VN');
  return `${time} ${day}`;
};

const ViolationTable = ({ data = [], onConfirm }) => {
  // Cấu hình URL gốc của backend để load ảnh trong thư mục /uploads/
  // Thay thế localhost:5000 bằng port thực tế backend của Dev 2
  const BASE_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

  const handleImageError = (e) => {
    e.target.src = 'https://via.placeholder.com/150x100?text=Lỗi+ảnh';
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">ID</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">Biển số</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">Loại xe</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">Lỗi vi phạm</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">Thời gian</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">Trạng thái</th>
            <th className="px-4 py-3 text-center font-medium text-gray-500 uppercase">Bằng chứng</th>
            <th className="px-4 py-3 text-center font-medium text-gray-500 uppercase">Thao tác</th>
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
                <img 
                  src={row.panorama_image_path ? `${BASE_URL}${row.panorama_image_path}` : 'https://via.placeholder.com/150x100?text=No+Image'} 
                  alt="Bằng chứng" 
                  className="h-16 w-24 object-cover rounded border"
                  onError={handleImageError}
                />
              </td>
              <td className="px-4 py-4 text-center">
                {row.status === 'Pending' && (
                  <button 
                    onClick={() => onConfirm(row.id)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-sm font-medium transition"
                  >
                    Xác nhận
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ViolationTable;