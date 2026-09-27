import React, { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import ViolationTable from '../components/ViolationTable';
import ViolationDetailModal from '../components/ViolationDetailModal';
import { violationService } from '../services/violationService';
import { SocketContext } from '../App';
import { useLocalStorage } from '../hooks/useLocalStorage';


const Violations = () => {
  // --- State dữ liệu ---
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // --- State filter (lưu vào localStorage) ---
  const [searchTerm, setSearchTerm] = useLocalStorage('filter_search', '');
  const [statusFilter, setStatusFilter] = useLocalStorage('filter_status', 'All');
  const [filterPlate, setFilterPlate] = useLocalStorage('filter_plate', '');
  const [filterType, setFilterType] = useLocalStorage('filter_type', '');
  const [filterDateFrom, setFilterDateFrom] = useLocalStorage('filter_date_from', '');
  const [filterDateTo, setFilterDateTo] = useLocalStorage('filter_date_to', '');

  // --- State UI ---
  const [showFilter, setShowFilter] = useState(false);
  const [selectedViolation, setSelectedViolation] = useState(null);
  const [processingId, setProcessingId] = useState(null);

  // --- State sort ---
  const [sortBy, setSortBy] = useLocalStorage('sort_by', 'violation_time');
  const [sortOrder, setSortOrder] = useLocalStorage('sort_order', 'desc');

  const socket = useContext(SocketContext);

  // ============ FETCH DATA ============
  const fetchViolations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await violationService.getViolations();
      const dataList = response?.data?.data || response?.data || [];
      setViolations(dataList);
    } catch (err) {
      console.error('Fetch violations error:', err);
      setError(err?.response?.data?.message || 'Không thể tải dữ liệu vi phạm.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchViolations();
  }, [fetchViolations]);

  // ============ SOCKET LISTENERS ============
  useEffect(() => {
    if (!socket) return;

    const formatData = (raw) => ({
      ...raw,
      id: raw.id || `TEMP_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      violation_time: raw.violation_time || raw.timestamp || new Date().toISOString(),
      status: raw.status || 'Pending',
      license_plate: raw.license_plate || '',
    });

    const handleNewViolation = (raw) => {
      console.log('🔔 new_violation:', raw);
      const newRecord = formatData(raw);
      setViolations((prevList) => {
        if (raw.id && prevList.some(v => v.id === raw.id)) {
          return prevList.map(v => v.id === raw.id ? { ...v, ...newRecord } : v);
        }
        return [newRecord, ...prevList];
      });
    };

    const handleViolationUpdated = (raw) => {
      console.log('🔄 violation_updated:', raw);
      const newRecord = formatData(raw);
      setViolations((prevList) => {
        const idx = prevList.findIndex(v => v.id === raw.id);
        if (idx >= 0) {
          const updated = {
            ...prevList[idx],
            ...newRecord,
            status: prevList[idx].status === 'Confirmed' ? 'Confirmed' : newRecord.status,
          };
          const newList = [...prevList];
          newList[idx] = updated;
          return newList;
        }
        return [newRecord, ...prevList];
      });
    };

    const handleVideoReady = (data) => {
      console.log('🎥 violation_video_ready:', data);
      setViolations(prev => prev.map(v =>
        v.id === data.violation_id ? { ...v, video_path: data.video_path } : v
      ));
    };

    socket.on('new_violation', handleNewViolation);
    socket.on('violation_updated', handleViolationUpdated);
    socket.on('violation_video_ready', handleVideoReady);

    return () => {
      socket.off('new_violation', handleNewViolation);
      socket.off('violation_updated', handleViolationUpdated);
      socket.off('violation_video_ready', handleVideoReady);
    };
  }, [socket]);

  // ============ ACTIONS ============
  const handleConfirm = async (id) => {
    const isConfirm = window.confirm('Bạn có chắc chắn muốn xác nhận vi phạm này?');
    if (!isConfirm) return;
    try {
      setProcessingId(id);
      await violationService.updateStatus(id, 'Confirmed');
      setViolations(prevList =>
        prevList.map(item => item.id === id ? { ...item, status: 'Confirmed' } : item)
      );
      alert('Đã xác nhận vi phạm thành công!');
    } catch (err) {
      console.error('Update status error:', err);
      alert(err?.response?.data?.message || 'Có lỗi xảy ra khi xác nhận vi phạm.');
    } finally {
      setProcessingId(null);
    }
  };

  // ============ FILTER + SORT LOGIC ============
  const filteredViolations = useMemo(() => {
    // 1. Lọc
    const filtered = violations.filter((item) => {
      const matchSearch =
        item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.id?.toString().includes(searchTerm);

      const matchStatus = statusFilter === 'All' || item.status === statusFilter;

      const matchPlate =
        filterPlate === '' ||
        (item.license_plate &&
          item.license_plate.toLowerCase().includes(filterPlate.toLowerCase()));

      const matchType = filterType === '' || item.violation_type === filterType;

      // Date range filter
      let matchDate = true;
      if (filterDateFrom || filterDateTo) {
        const itemDateStr = item.violation_time?.split('T')[0];
        if (itemDateStr) {
          if (filterDateFrom && itemDateStr < filterDateFrom) matchDate = false;
          if (filterDateTo && itemDateStr > filterDateTo) matchDate = false;
        } else {
          matchDate = false;
        }
      }

      return matchSearch && matchStatus && matchPlate && matchType && matchDate;
    });

    // 2. Sort
    const sorted = [...filtered].sort((a, b) => {
      let aVal, bVal;

      switch (sortBy) {
        case 'license_plate':
          aVal = a.license_plate || '';
          bVal = b.license_plate || '';
          break;
        case 'violation_type':
          aVal = a.violation_type || '';
          bVal = b.violation_type || '';
          break;
        case 'status':
          aVal = a.status || '';
          bVal = b.status || '';
          break;
        case 'violation_time':
        default:
          aVal = new Date(a.violation_time || 0).getTime();
          bVal = new Date(b.violation_time || 0).getTime();
          break;
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [violations, searchTerm, statusFilter, filterPlate, filterType,
      filterDateFrom, filterDateTo, sortBy, sortOrder]);

  // ============ HELPERS ============
  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('All');
    setFilterPlate('');
    setFilterType('');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

  // Đếm số filter đang active
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm) count++;
    if (statusFilter && statusFilter !== 'All') count++;
    if (filterPlate) count++;
    if (filterType) count++;
    if (filterDateFrom) count++;
    if (filterDateTo) count++;
    return count;
  }, [searchTerm, statusFilter, filterPlate, filterType, filterDateFrom, filterDateTo]);

  // Toggle sort khi click header
  const handleSort = (columnKey) => {
    if (sortBy === columnKey) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(columnKey);
      setSortOrder('desc');
    }
  };

  // ============ RENDER ============
  return (
    <div className="p-0 sm:p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 sm:mb-6 gap-4 px-2 sm:px-0">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Danh sách vi phạm</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Hiển thị <b>{filteredViolations.length}</b> / {violations.length} vi phạm
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full md:w-auto">
          {/* Search */}
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Tìm kiếm..."
              className="px-3 sm:px-4 py-2 pr-10 border rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full text-sm sm:text-base"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 px-2"
              >
                ✕
              </button>
            )}
          </div>

          {/* Refresh & Filter Toggle container on mobile */}
          <div className="flex gap-2 w-full sm:w-auto">
            {/* Refresh */}
            <button
              onClick={fetchViolations}
              className="flex-1 sm:flex-none bg-white sm:bg-gray-100 text-gray-700 px-3 sm:px-4 py-2 rounded border shadow-sm hover:bg-gray-200 transition text-sm sm:text-base font-medium flex justify-center items-center gap-1"
              title="Làm mới dữ liệu"
            >
              🔄 <span className="hidden sm:inline">Làm mới</span>
            </button>

            {/* Filter toggle */}
            <button
              onClick={() => setShowFilter(!showFilter)}
              className={`flex-1 sm:flex-none flex justify-center items-center gap-1 ${
                showFilter ? 'bg-gray-500' : 'bg-blue-600'
              } text-white px-3 sm:px-4 py-2 rounded shadow hover:opacity-90 transition relative text-sm sm:text-base font-medium`}
            >
              {showFilter ? 'Đóng bộ lọc' : 'Bộ lọc nâng cao'}
              {activeFilterCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] sm:text-xs rounded-full w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center font-bold border border-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilter && (
        <div className="bg-white p-4 sm:p-5 rounded-lg shadow mb-4 sm:mb-6 border border-gray-100 mx-2 sm:mx-0">
          <div className="flex justify-between items-center mb-3 sm:mb-4 pb-2 border-b">
            <h3 className="font-semibold text-gray-700 text-sm sm:text-base">🔍 Bộ lọc nâng cao</h3>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="text-xs sm:text-sm text-red-500 hover:text-red-700 font-medium bg-red-50 hover:bg-red-100 px-2 py-1 rounded transition"
              >
                ✕ Xoá tất cả ({activeFilterCount})
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* Status */}
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                Trạng thái
              </label>
              <select
                className="w-full border border-gray-300 rounded px-2 sm:px-3 py-1.5 sm:py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="All">Tất cả</option>
                <option value="Pending">Chờ xử lý</option>
                <option value="Confirmed">Đã xác nhận</option>
              </select>
            </div>

            {/* Plate */}
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                Biển số xe
              </label>
              <input
                type="text"
                placeholder="VD: 29AE..."
                className="w-full border border-gray-300 rounded px-2 sm:px-3 py-1.5 sm:py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={filterPlate}
                onChange={(e) => setFilterPlate(e.target.value)}
              />
            </div>

            {/* Type */}
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                Loại vi phạm
              </label>
              <select
                className="w-full border border-gray-300 rounded px-2 sm:px-3 py-1.5 sm:py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="">Tất cả lỗi</option>
                <option value="NO_HELMET">Không đội mũ bảo hiểm</option>
                <option value="RED_LIGHT">Vượt đèn đỏ</option>
              </select>
            </div>

            {/* Sort */}
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                Sắp xếp theo
              </label>
              <select
                className="w-full border border-gray-300 rounded px-2 sm:px-3 py-1.5 sm:py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                value={`${sortBy}_${sortOrder}`}
                onChange={(e) => {
                  const [by, order] = e.target.value.split('_');
                  setSortBy(by);
                  setSortOrder(order);
                }}
              >
                <option value="violation_time_desc">Thời gian (mới → cũ)</option>
                <option value="violation_time_asc">Thời gian (cũ → mới)</option>
                <option value="license_plate_asc">Biển số (A → Z)</option>
                <option value="license_plate_desc">Biển số (Z → A)</option>
                <option value="violation_type_asc">Loại (A → Z)</option>
                <option value="status_asc">Trạng thái</option>
              </select>
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-3 sm:mt-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                📅 Từ ngày
              </label>
              <input
                type="date"
                className="w-full border border-gray-300 rounded px-2 sm:px-3 py-1.5 sm:py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                📅 Đến ngày
              </label>
              <input
                type="date"
                className="w-full border border-gray-300 rounded px-2 sm:px-3 py-1.5 sm:py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-2 sm:mx-0 bg-red-50 border-l-4 border-red-500 text-red-700 p-3 sm:p-4 rounded mb-4 sm:mb-6 flex justify-between items-center text-sm sm:text-base shadow-sm">
          <p>{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold px-2">
            &times;
          </button>
        </div>
      )}

      {/* Table Container */}
      <div className="px-2 sm:px-0">
        <div className="bg-white rounded-lg shadow">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-gray-500">
              <svg className="animate-spin h-6 w-6 sm:h-8 sm:w-8 text-blue-600 mb-3 sm:mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="font-medium text-sm sm:text-base">Đang tải dữ liệu...</p>
            </div>
          ) : filteredViolations.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-gray-500 text-center">
              <p className="text-base sm:text-lg font-medium mb-2">Không tìm thấy vi phạm nào.</p>
              <p className="text-xs sm:text-sm text-gray-400">
                {activeFilterCount > 0
                  ? 'Hãy thử xoá bớt bộ lọc.'
                  : 'Chạy video để bắt đầu thu thập dữ liệu.'}
              </p>
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="mt-4 px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-600 text-white text-sm sm:text-base rounded hover:bg-blue-700 transition"
                >
                  Xoá tất cả bộ lọc
                </button>
              )}
            </div>
          ) : (
            <ViolationTable
              data={filteredViolations}
              onConfirm={handleConfirm}
              processingId={processingId}
              onViewDetail={(row) => setSelectedViolation(row)}
              onSort={handleSort}
              sortBy={sortBy}
              sortOrder={sortOrder}
            />
          )}
        </div>
      </div>

      {/* Detail Modal */}
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