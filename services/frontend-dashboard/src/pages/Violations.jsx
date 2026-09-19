import React, { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import ViolationTable from '../components/ViolationTable';
import ViolationDetailModal from '../components/ViolationDetailModal';
import { violationService } from '../services/violationService';
import { SocketContext } from '../App'; 


const Violations = () => {
  // --- State dữ liệu gốc ---
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // --- State UX ---
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [processingId, setProcessingId] = useState(null); 
  
  // --- State lọc nâng cao & Modal ---
  const [selectedViolation, setSelectedViolation] = useState(null);
  const [showFilter, setShowFilter] = useState(false); 
  const [filterPlate, setFilterPlate] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterDate, setFilterDate] = useState('');

  // Socket
  const socket = useContext(SocketContext);

  // Hàm tải dữ liệu từ API
  const fetchViolations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await violationService.getViolations();
      const dataList = response?.data?.data || response?.data || [];
      setViolations(dataList);
    } catch (err) {
      console.error('Fetch violations error:', err);
      setError(err?.response?.data?.message || 'Không thể tải dữ liệu vi phạm từ server. Vui lòng kiểm tra kết nối.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchViolations();
  }, [fetchViolations]);

  // ============ SOCKET LISTENERS (FIXED) ============
  useEffect(() => {
    if (!socket) return;

    // Chuẩn hoá dữ liệu từ socket về cùng format với API
    const formatData = (raw) => ({
      ...raw,
      // Nếu không có id, tạo temp id duy nhất
      id: raw.id || `TEMP_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      violation_time: raw.violation_time || raw.timestamp || new Date().toISOString(),
      status: raw.status || 'Pending',
      // Đảm bảo license_plate là string rỗng nếu null
      license_plate: raw.license_plate || '',
    });

    // Xử lý vi phạm MỚI (INSERT)
    const handleNewViolation = (raw) => {
      console.log('🔔 new_violation:', raw);
      const newRecord = formatData(raw);

      setViolations((prevList) => {
        // Nếu đã có record cùng id (race condition) → update thay vì thêm
        if (raw.id && prevList.some(v => v.id === raw.id)) {
          return prevList.map(v =>
            v.id === raw.id ? { ...v, ...newRecord } : v
          );
        }
        return [newRecord, ...prevList];
      });
    };

    // Xử lý vi phạm CẬP NHẬT (UPDATE — retroactive)
    const handleViolationUpdated = (raw) => {
      console.log('🔄 violation_updated:', raw);
      const newRecord = formatData(raw);

      setViolations((prevList) => {
        const idx = prevList.findIndex(v => v.id === raw.id);

        if (idx >= 0) {
          // Cập nhật record cũ, giữ status nếu đã Confirmed
          const updatedRecord = {
            ...prevList[idx],
            ...newRecord,
            // Giữ status cũ nếu đã xác nhận (không bị reset về Pending)
            status: prevList[idx].status === 'Confirmed'
              ? 'Confirmed'
              : newRecord.status,
          };
          const newList = [...prevList];
          newList[idx] = updatedRecord;
          return newList;
        }

        // Không tìm thấy (FE bị mất sync) → thêm mới
        console.warn(`⚠️ Không tìm thấy record id=${raw.id} để update. Thêm mới.`);
        return [newRecord, ...prevList];
      });
    };

    // Video sẵn sàng (2 giây sau vi phạm)
    const onVideoReady = (data) => {
      console.log('🎥 violation_video_ready:', data);
      setViolations(prev => prev.map(v =>
        v.id === data.violation_id 
           ? { ...v, video_path: data.video_path } 
           : v
      ));
    };

    socket.on('new_violation', handleNewViolation);
    socket.on('violation_updated', handleViolationUpdated);
    socket.on('violation_video_ready', onVideoReady);

    return () => {
      socket.off('new_violation', handleNewViolation);
      socket.off('violation_updated', handleViolationUpdated);
      socket.off('violation_video_ready', onVideoReady);
    };
  }, [socket]);
  // ============ END SOCKET LISTENERS ============

  const handleConfirm = async (id) => {
    const isConfirm = window.confirm('Bạn có chắc chắn muốn xác nhận vi phạm này?');
    if (!isConfirm) return;
    try {
      setProcessingId(id);
      await violationService.updateStatus(id, 'Confirmed');
      setViolations((prevList) => 
        prevList.map((item) => 
          item.id === id ? { ...item, status: 'Confirmed' } : item
        )
      );
      alert('Đã xác nhận vi phạm thành công!');
    } catch (err) {
      console.error('Update status error:', err);
      alert(err?.response?.data?.message || 'Có lỗi xảy ra khi xác nhận vi phạm. Vui lòng thử lại.');
    } finally {
      setProcessingId(null);
    }
  };

  // Kết hợp bộ lọc
  const filteredViolations = useMemo(() => {
    return violations.filter((item) => {
      const matchSearch = item.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.id?.toString().includes(searchTerm);
      const matchStatus = statusFilter === 'All' || item.status === statusFilter;
      const matchPlate = filterPlate === '' || 
                         (item.license_plate && item.license_plate.toLowerCase().includes(filterPlate.toLowerCase()));
      const matchType = filterType === '' || item.violation_type === filterType;
      
      let matchDate = true;
      if (filterDate) {
        const itemDate = item.violation_time?.split('T')[0];
        matchDate = itemDate === filterDate;
      }

      return matchSearch && matchStatus && matchPlate && matchType && matchDate;
    });
  }, [violations, searchTerm, statusFilter, filterPlate, filterType, filterDate]);

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('All');
    setFilterPlate('');
    setFilterType('');
    setFilterDate('');
  };

  return (
    <div className="p-4 md:p-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Danh sách vi phạm</h2>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <input 
            type="text" 
            placeholder="Tìm kiếm vi phạm..." 
            className="px-4 py-2 border rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <button 
            onClick={fetchViolations}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded border shadow-sm hover:bg-gray-200 transition"
            title="Làm mới dữ liệu"
          >
            Làm mới
          </button>
          
          <button 
            onClick={() => setShowFilter(!showFilter)}
            className={`${showFilter ? 'bg-gray-500' : 'bg-blue-600'} text-white px-4 py-2 rounded shadow hover:opacity-90 transition`}
          >
            {showFilter ? 'Đóng bộ lọc' : 'Bộ lọc nâng cao'}
          </button>
        </div>
      </div>

      {/* KHUNG LỌC NÂNG CAO */}
      {showFilter && (
        <div className="bg-white p-5 rounded-lg shadow mb-6 border border-gray-100 flex flex-wrap gap-4 items-end animate-fade-in-down">
          
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái</label>
            <select 
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="All">Tất cả</option>
              <option value="Pending">Chờ xử lý</option>
              <option value="Confirmed">Đã xác nhận</option>
            </select>
          </div>

          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Biển số xe</label>
            <input 
              type="text" 
              placeholder="VD: 29AE..." 
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filterPlate}
              onChange={(e) => setFilterPlate(e.target.value)}
            />
          </div>
          
          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Loại vi phạm</label>
            <select 
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="">Tất cả lỗi</option>
              <option value="NO_HELMET">Không đội mũ bảo hiểm</option>
              <option value="RED_LIGHT">Vượt đèn đỏ</option>
            </select>
          </div>

          <div className="flex-1 min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Ngày vi phạm</label>
            <input 
              type="date" 
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
            />
          </div>

          <button 
            onClick={clearFilters}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded transition border border-gray-300 h-[42px]"
          >
            Xóa lọc
          </button>
        </div>
      )}

      {/* Thông báo Lỗi */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded mb-6 flex justify-between items-center">
          <p>{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">
            &times;
          </button>
        </div>
      )}
      
      {/* Nội dung */}
      <div className="bg-white rounded-lg shadow">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-gray-500">
            <svg className="animate-spin h-8 w-8 text-blue-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="font-medium">Đang tải dữ liệu từ máy chủ...</p>
          </div>
        ) : filteredViolations.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-gray-500">
            <p className="text-lg font-medium mb-2">Không tìm thấy vi phạm nào.</p>
            <p className="text-sm">Hãy thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.</p>
          </div>
        ) : (
          <ViolationTable 
            data={filteredViolations} 
            onConfirm={handleConfirm} 
            processingId={processingId}
            onViewDetail={(row) => setSelectedViolation(row)}
          />
        )}
      </div>

      {/* Modal chi tiết */}
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