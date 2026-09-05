import React, { useState, useEffect } from 'react';
import ViolationTable from '../components/ViolationTable';
import ViolationDetailModal from '../components/ViolationDetailModal';
import { violationService } from '../services/violationService';

const Violations = () => {
  // State dữ liệu gốc
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedViolation, setSelectedViolation] = useState(null);

  // --- BỔ SUNG: STATE CHO BỘ LỌC ---
  const [showFilter, setShowFilter] = useState(false); // Ẩn/hiện khung lọc
  const [filterPlate, setFilterPlate] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDate, setFilterDate] = useState('');

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

  useEffect(() => {
    fetchViolations();
  }, []);

  const handleConfirm = async (id) => {
    const isConfirm = window.confirm('Bạn có chắc chắn muốn xác nhận vi phạm này?');
    if (!isConfirm) return;
    try {
      await violationService.updateStatus(id, 'Confirmed');
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

  // --- BỔ SUNG: LOGIC XỬ LÝ LỌC ---
  const filteredViolations = violations.filter((item) => {
    // 1. Lọc biển số (không phân biệt hoa thường)
    const matchPlate = item.license_plate?.toLowerCase().includes(filterPlate.toLowerCase());
    
    // 2. Lọc loại lỗi (Nếu chưa chọn thì bỏ qua điều kiện này)
    const matchType = filterType === '' || item.violation_type === filterType;
    
    // 3. Lọc theo ngày (Cắt chuỗi thời gian để lấy phần YYYY-MM-DD so sánh)
    let matchDate = true;
    if (filterDate) {
      // Giả sử API trả về violation_time dạng ISO 8601 (VD: 2026-09-05T15:16:42.000Z)
      const itemDate = item.violation_time?.split('T')[0];
      matchDate = itemDate === filterDate;
    }

    return matchPlate && matchType && matchDate;
  });

  // Hàm xóa trắng các ô lọc
  const clearFilters = () => {
    setFilterPlate('');
    setFilterType('');
    setFilterDate('');
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Danh sách vi phạm</h2>
        
        {/* Nút bật/tắt Bộ lọc */}
        <button 
          onClick={() => setShowFilter(!showFilter)}
          className={`${showFilter ? 'bg-gray-500' : 'bg-blue-600'} text-white px-4 py-2 rounded shadow hover:opacity-90 transition`}
        >
          {showFilter ? 'Đóng bộ lọc' : 'Bộ lọc'}
        </button>
      </div>

      {/* --- BỔ SUNG: GIAO DIỆN KHUNG LỌC --- */}
      {showFilter && (
        <div className="bg-white p-5 rounded-lg shadow mb-6 border border-gray-100 flex flex-wrap gap-4 items-end animate-fade-in-down">
          
          {/* Ô lọc Biển số */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Biển số xe</label>
            <input 
              type="text" 
              placeholder="VD: 29AE..." 
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filterPlate}
              onChange={(e) => setFilterPlate(e.target.value)}
            />
          </div>
          
          {/* Ô lọc Loại lỗi */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Loại vi phạm</label>
            <select 
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="">Tất cả lỗi</option>
              <option value="no_helmet">Không đội mũ bảo hiểm</option>
              <option value="red_light">Vượt đèn đỏ</option>
            </select>
          </div>

          {/* Ô lọc Thời gian (Ngày) */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Ngày vi phạm</label>
            <input 
              type="date" 
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            />
          </div>

          {/* Nút Xóa lọc */}
          <button 
            onClick={clearFilters}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded transition border border-gray-300 h-[42px]"
          >
            Xóa lọc
          </button>
        </div>
      )}

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
      
      {/* Sửa lại: Truyền filteredViolations thay vì violations */}
      {!loading && !error && (
        <>
          <ViolationTable 
            data={filteredViolations} 
            onConfirm={handleConfirm} 
            onViewDetail={(row) => setSelectedViolation(row)} 
          />
          
          {/* Hiển thị thông báo nếu lọc không ra kết quả nào */}
          {filteredViolations.length === 0 && violations.length > 0 && (
            <div className="text-center p-8 bg-gray-50 text-gray-500 rounded mt-4 border border-dashed border-gray-300">
              Không tìm thấy dữ liệu phù hợp với điều kiện lọc.
            </div>
          )}
        </>
      )}

      {selectedViolation && (
        <ViolationDetailModal 
          violation={selectedViolation} 
          onClose={() => setSelectedViolation(null)} 
        />
      )}
    </div>
  );
};

export default Violations;