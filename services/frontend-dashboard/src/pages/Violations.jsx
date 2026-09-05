import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ViolationTable from '../components/ViolationTable';
import { violationService } from '../services/violationService';

const Violations = () => {
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // States cho bộ lọc và UX
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [processingId, setProcessingId] = useState(null); // ID của vi phạm đang được xử lý

  // Hàm tải dữ liệu từ API (dùng useCallback để tối ưu)
  const fetchViolations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await violationService.getViolations();
      
      const dataList = response?.data?.data || response?.data || [];
      setViolations(dataList);
    } catch (err) {
      console.error('Fetch violations error:', err);
      // Lấy câu báo lỗi từ backend nếu có, nếu không thì dùng câu mặc định
      setError(err?.response?.data?.message || 'Không thể tải dữ liệu vi phạm từ server. Vui lòng kiểm tra kết nối.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Gọi API lần đầu khi mở trang
  useEffect(() => {
    fetchViolations();
  }, [fetchViolations]);

  // Xử lý sự kiện bấm nút "Xác nhận"
  const handleConfirm = async (id) => {
    const isConfirm = window.confirm('Bạn có chắc chắn muốn xác nhận vi phạm này?');
    if (!isConfirm) return;

    try {
      setProcessingId(id); // Vô hiệu hóa nút trong lúc gọi API
      
      // Gọi API update trạng thái thành 'Confirmed'
      await violationService.updateStatus(id, 'Confirmed');
      
      // Cập nhật lại state giao diện ngay lập tức
      setViolations((prevList) => 
        prevList.map((item) => 
          item.id === id ? { ...item, status: 'Confirmed' } : item
        )
      );
      
      // Lưu ý: Trong dự án thực tế, bạn có thể thay thế alert bằng Toast Notification (vd: react-toastify)
      alert('Đã xác nhận vi phạm thành công!');
    } catch (err) {
      console.error('Update status error:', err);
      alert(err?.response?.data?.message || 'Có lỗi xảy ra khi xác nhận vi phạm. Vui lòng thử lại.');
    } finally {
      setProcessingId(null);
    }
  };

  // Lọc dữ liệu dựa trên từ khóa tìm kiếm và trạng thái (dùng useMemo để tối ưu hiệu suất)
  const filteredViolations = useMemo(() => {
    return violations.filter((item) => {
      // Tùy chỉnh các trường bạn muốn tìm kiếm (vd: name, title, code...)
      const matchSearch = item.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.id?.toString().includes(searchTerm);
      
      const matchStatus = statusFilter === 'All' || item.status === statusFilter;
      
      return matchSearch && matchStatus;
    });
  }, [violations, searchTerm, statusFilter]);

  return (
    <div className="p-4 md:p-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Danh sách vi phạm</h2>
        
        {/* Khu vực Tìm kiếm và Bộ lọc */}
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <input 
            type="text" 
            placeholder="Tìm kiếm vi phạm..." 
            className="px-4 py-2 border rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select 
            className="px-4 py-2 border rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All">Tất cả trạng thái</option>
            <option value="Pending">Chờ xử lý</option>
            <option value="Confirmed">Đã xác nhận</option>
          </select>
          <button 
            onClick={fetchViolations}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded border shadow-sm hover:bg-gray-200 transition"
            title="Làm mới dữ liệu"
          >
            Làm mới
          </button>
        </div>
      </div>

      {/* Thông báo Lỗi */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded mb-6 flex justify-between items-center">
          <p>{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">
            &times;
          </button>
        </div>
      )}
      
      {/* Khung hiển thị Nội dung */}
      <div className="bg-white rounded-lg shadow">
        {loading ? (
          // Trạng thái Loading
          <div className="flex flex-col items-center justify-center p-12 text-gray-500">
            <svg className="animate-spin h-8 w-8 text-blue-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="font-medium">Đang tải dữ liệu từ máy chủ...</p>
          </div>
        ) : filteredViolations.length === 0 ? (
          // Trạng thái Trống (Empty State)
          <div className="flex flex-col items-center justify-center p-12 text-gray-500">
            <p className="text-lg font-medium mb-2">Không tìm thấy vi phạm nào.</p>
            <p className="text-sm">Hãy thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.</p>
          </div>
        ) : (
          // Bảng dữ liệu
          <ViolationTable 
            data={filteredViolations} 
            onConfirm={handleConfirm} 
            processingId={processingId} // Truyền ID này xuống table để disable nút của dòng đang được xử lý
          />
        )}
      </div>
    </div>
  );
};

export default Violations;