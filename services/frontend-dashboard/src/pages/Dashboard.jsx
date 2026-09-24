import React, { useState, useEffect, useContext, useCallback } from 'react';
import { violationService } from '../services/violationService';
import StatisticsCharts from '../components/StatisticsCharts';
import ExportButtons from '../components/ExportButtons';
import { SocketContext } from '../App';

const Dashboard = () => {
  const [stats, setStats] = useState({ total: 0, today: 0 });
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [serverStatus, setServerStatus] = useState('Đang kết nối...');

  const socket = useContext(SocketContext);

  // ============ FETCH DATA ============
  const fetchDashboardStats = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const response = await violationService.getViolations();
      const dataList = response?.data?.data || response?.data || [];

      const total = dataList.length;
      const todayStr = new Date().toISOString().split('T')[0];
      const todayCount = dataList.filter(item => {
        if (!item.violation_time) return false;
        return item.violation_time.startsWith(todayStr);
      }).length;

      setStats({ total, today: todayCount });
      setViolations(dataList);
      setServerStatus('Online');
    } catch (error) {
      console.error('Lỗi khi tải dữ liệu thống kê:', error);
      setServerStatus('Offline');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // ============ INITIAL LOAD + POLLING ============
  useEffect(() => {
    fetchDashboardStats();   // Lần đầu — có loading

    // Polling 30s (silent) — dự phòng nếu socket fail
    const intervalId = setInterval(() => fetchDashboardStats(true), 30000);
    return () => clearInterval(intervalId);
  }, [fetchDashboardStats]);

  // ============ SOCKET LISTENER — REALTIME UPDATE ============
  useEffect(() => {
    if (!socket) return;

    // ✅ Khi có vi phạm mới (INSERT)
    const handleNewViolation = (data) => {
      console.log('📊 Dashboard: new_violation → tăng total', data);

      // Cách 1: Cập nhật state NGAY (nhanh)
      setViolations((prev) => {
        if (data.id && prev.some(v => v.id === data.id)) return prev;
        return [data, ...prev];
      });

      // Cách 2: Fetch lại để đồng bộ với DB (sau 1s)
      setTimeout(() => fetchDashboardStats(true), 1000);
    };

    // ✅ Khi có vi phạm được UPDATE (retroactive)
    const handleViolationUpdated = (data) => {
      console.log('📊 Dashboard: violation_updated', data);
      setViolations((prev) =>
        prev.map((v) => (v.id === data.id ? { ...v, ...data } : v))
      );
    };

    // ✅ Khi video xử lý xong
    const handleVideoProgress = () => {
      // Không cần làm gì — Dashboard chỉ quan tâm violations
    };

    socket.on('new_violation', handleNewViolation);
    socket.on('violation_updated', handleViolationUpdated);
    socket.on('video_progress', handleVideoProgress);

    return () => {
      socket.off('new_violation', handleNewViolation);
      socket.off('violation_updated', handleViolationUpdated);
      socket.off('video_progress', handleVideoProgress);
    };
  }, [socket, fetchDashboardStats]);

  // ============ RENDER ============
  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
        <h2 className="text-2xl font-bold">Tổng quan hệ thống</h2>
        <ExportButtons violations={violations} stats={stats} />
      </div>

      {loading && (
        <p className="text-gray-500 mb-4 animate-pulse">
          Đang đồng bộ dữ liệu thời gian thực...
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Tổng số vi phạm */}
        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-blue-500 transition-all hover:shadow-md">
          <h3 className="text-gray-500 text-sm">Tổng số lượt xe (vi phạm)</h3>
          <p className="text-3xl font-bold">
            {loading ? '...' : stats.total}
          </p>
        </div>

        {/* Vi phạm hôm nay */}
        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-red-500 transition-all hover:shadow-md">
          <h3 className="text-gray-500 text-sm">Vi phạm hôm nay</h3>
          <p className="text-3xl font-bold text-red-600">
            {loading ? '...' : stats.today}
          </p>
        </div>

        {/* Trạng thái Server */}
        <div
          className={`bg-white p-6 rounded-lg shadow-sm border-l-4 ${
            serverStatus === 'Online' ? 'border-green-500' : 'border-red-500'
          }`}
        >
          <h3 className="text-gray-500 text-sm">Trạng thái Server API</h3>
          <p
            className={`text-3xl font-bold ${
              serverStatus === 'Online' ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {serverStatus}
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="mt-8">
        <h2 className="text-xl font-bold text-gray-800 mb-4">
          📊 Thống kê chi tiết
        </h2>
        <StatisticsCharts violations={violations} />
      </div>
    </div>
  );
};

export default Dashboard;