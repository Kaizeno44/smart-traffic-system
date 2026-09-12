import React from 'react';
import { X } from 'lucide-react';

// Hàm chuẩn hóa lỗi vi phạm giống ở bảng
const formatViolationError = (error) => {
  const map = {
    'no_helmet': 'KHÔNG ĐỘI MŨ BẢO HIỂM',
    'red_light': 'VƯỢT ĐÈN ĐỎ'
  };
  return map[error?.toLowerCase()] || error;
};

// Hàm định dạng thời gian giống ở bảng
const formatTime = (timeString) => {
  if (!timeString) return '';
  const date = new Date(timeString);
  const time = date.toLocaleTimeString('vi-VN', { hour12: false }); 
  const day = date.toLocaleDateString('vi-VN');
  return `${time} ${day}`;
};

// Đã sửa lại Props cho khớp với file Violations.jsx
const ViolationDetailModal = ({ violation, onClose }) => {
  if (!violation) return null;

  // Xử lý link ảnh giống hệt như ở bảng
  const BASE_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3000';
  const getImageUrl = (path) => {
    if (!path) return 'https://via.placeholder.com/600x400?text=No+Image';
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    return `${BASE_URL}/${cleanPath}`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl p-6 relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-800"
        >
          <X size={24} />
        </button>
        
        <h3 className="text-xl font-bold mb-4 border-b pb-2">Chi tiết vi phạm #{violation.id}</h3>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-gray-500 text-sm">Biển số xe</p>
            <p className="font-bold text-lg text-red-600">{violation.license_plate}</p>
          </div>
          <div>
            <p className="text-gray-500 text-sm">Thời gian</p>
            <p className="font-semibold">{formatTime(violation.violation_time)}</p>
          </div>
          <div className="col-span-2">
            <p className="text-gray-500 text-sm">Loại lỗi</p>
            <p className="font-semibold text-red-600">
              {formatViolationError(violation.violation_type)}
            </p>
          </div>
        </div>

        <div>
          <p className="text-gray-500 text-sm mb-2">Ảnh bằng chứng</p>
          <div className="bg-gray-100 rounded overflow-hidden flex items-center justify-center border">
            {/* Đã thay Mockup bằng thẻ ảnh thật */}
            <img 
              src={getImageUrl(violation.panorama_image_path)} 
              alt="Bằng chứng vi phạm" 
              className="w-full h-auto object-contain max-h-[400px]"
              onError={(e) => { e.target.src = 'https://via.placeholder.com/600x400?text=Lỗi+ảnh' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViolationDetailModal;