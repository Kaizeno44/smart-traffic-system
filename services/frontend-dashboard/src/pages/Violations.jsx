import React, { useState, useEffect } from 'react';
import ViolationTable from '../components/ViolationTable';
import { violationService } from '../services/violationService';

const Violations = () => {
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Hàm tải dữ liệu từ API
  const fetchViolations = async () => {
    try {
      setLoading(true);
      const response = await violationService.getViolations();
      
      const dataList = response.data?.data || response.data || [];
      setViolations(dataList);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError('Không thể tải dữ liệu vi phạm từ server.');
      setLoading(false);
    }
  };

  // Gọi API lần đầu khi mở trang
  useEffect(() => {
    fetchViolations();
  }, []);

  // Xử lý sự kiện bấm nút "Xác nhận"
  const handleConfirm = async (id) => {
    const isConfirm = window.confirm('Bạn có chắc chắn muốn xác nhận vi phạm này?');
    if (!isConfirm) return;

    try {
      // Gọi API update trạng thái thành 'Confirmed'
      await violationService.updateStatus(id, 'Confirmed');
      
      // Cập nhật lại state giao diện ngay lập tức mà không cần load lại trang
      setViolations((prevList) => 
        prevList.map((item) => 
          item.id === id ? { ...item, status: 'Confirmed' } : item
        )
      );
      
      alert('Đã xác nhận vi phạm thành công!');
    } catch (err) {
      console.error(err);
      alert('Có lỗi xảy ra khi xác nhận vi phạm. Vui lòng thử lại.');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Danh sách vi phạm</h2>
        <button className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 transition">
          Bộ lọc
        </button>
      </div>

      {/* Hiển thị trạng thái tải và lỗi */}
      {loading && (
        <div className="flex justify-center p-8">
          <p className="text-gray-500 font-medium">Đang tải dữ liệu từ máy chủ...</p>
        </div>
      )}
      
      {error && (
        <div className="bg-red-100 text-red-700 p-4 rounded mb-4">
          {error}
        </div>
      )}
      
      {/* Hiển thị bảng dữ liệu khi không tải và không lỗi */}
      {!loading && !error && (
        <ViolationTable 
          data={violations} 
          onConfirm={handleConfirm} 
        />
      )}
    </div>
  );
};

export default Violations;