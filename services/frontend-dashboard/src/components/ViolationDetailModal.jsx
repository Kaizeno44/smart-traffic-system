import React from 'react';
import { X } from 'lucide-react';

const ViolationDetailModal = ({ isOpen, onClose, data }) => {
  if (!isOpen || !data) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl p-6 relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-800"
        >
          <X size={24} />
        </button>
        
        <h3 className="text-xl font-bold mb-4 border-b pb-2">Chi tiết vi phạm</h3>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-gray-500 text-sm">Biển số xe</p>
            <p className="font-bold text-lg">{data.plate}</p>
          </div>
          <div>
            <p className="text-gray-500 text-sm">Thời gian</p>
            <p className="font-semibold">{data.time}</p>
          </div>
          <div className="col-span-2">
            <p className="text-gray-500 text-sm">Loại lỗi</p>
            <p className="font-semibold text-red-600">{data.type}</p>
          </div>
        </div>

        <div>
          <p className="text-gray-500 text-sm mb-2">Ảnh bằng chứng (Mockup)</p>
          <div className="bg-gray-200 h-64 rounded flex items-center justify-center text-gray-400">
            [Ảnh camera AI cắt ra sẽ hiển thị ở đây]
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViolationDetailModal;