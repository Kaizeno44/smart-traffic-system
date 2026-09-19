import React, { useState, useEffect, useContext, useCallback } from 'react';
import { violationService } from '../services/violationService';
import { SocketContext } from '../App';

const Dashboard = () => {
  const [stats, setStats] = useState({ total: 0, today: 0 });
  const [loading, setLoading] = useState(true);
  const [serverStatus, setServerStatus] = useState('Đang kết nối...');

  const socket = useContext(SocketContext);

  const fetchDashboardStats = useCallback(async () => {
    try {
      const response = await violationService.getViolations();
      const dataList = response?.data?.data || response?.data || [];

      const total = dataList.length;
      const todayStr = new Date().toISOString().split('T')[0];
      const todayCount = dataList.filter(item => {
        if (!item.violation_time) return false;
        return item.violation_time.startsWith(todayStr);
      }).length;

      setStats({ total, today: todayCount });
      setServerStatus('Online');
    } catch (error) {
      console.error('Lỗi khi tải dữ liệu thống kê:', error);
      setServerStatus('Offline');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Load lần đầu
    fetchDashboardStats();

    // Polling chậm hơn (30s) để refresh tổng thể, tránh spam API
    const intervalId = setInterval(fetchDashboardStats, 30000);
    return () => clearInterval(intervalId);
  }, [fetchDashboardStats]);

  // ✅ Realtime update qua socket (nhanh hơn polling)
  useEffect(() => {
    if (!socket) return;

    const bumpTotal = () => {
      setStats(prev => ({ ...prev, total: prev.total + 1 }));
      const todayStr = new Date().toISOString().split('T')[0];
      setStats(prev => ({
        ...prev,
        today: prev.today + (todayStr ? 1 : 0),
      }));
    };

    const onNew = () => {
      console.log('📊 Dashboard: new_violation → tăng total');
      // Sau 1s, refetch để đồng bộ số liệu chuẩn xác
      setTimeout(fetchDashboardStats, 1000);
    };

    const onUpdated = () => {
      console.log('📊 Dashboard: violation_updated → không tăng total');
      // Không tăng vì chỉ update, không phải tạo mới
    };

    socket.on('new_violation', onNew);
    socket.on('violation_updated', onUpdated);

    return () => {
      socket.off('new_violation', onNew);
      socket.off('violation_updated', onUpdated);
    };
  }, [socket, fetchDashboardStats]);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Tổng quan hệ thống</h2>
      
      {loading && <p className="text-gray-500 mb-4 animate-pulse">Đang đồng bộ dữ liệu thời gian thực...</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-blue-500 transition-all hover:shadow-md">
          <h3 className="text-gray-500 text-sm">Tổng số lượt xe (vi phạm)</h3>
          <p className="text-3xl font-bold">
            {loading ? '...' : stats.total}
          </p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-red-500 transition-all hover:shadow-md">
          <h3 className="text-gray-500 text-sm">Vi phạm hôm nay</h3>
          <p className="text-3xl font-bold text-red-600">
            {loading ? '...' : stats.today}
          </p>
        </div>
        
        <div className={`bg-white p-6 rounded-lg shadow-sm border-l-4 ${serverStatus === 'Online' ? 'border-green-500' : 'border-red-500'}`}>
          <h3 className="text-gray-500 text-sm">Trạng thái Server API</h3>
          <p className={`text-3xl font-bold ${serverStatus === 'Online' ? 'text-green-600' : 'text-red-600'}`}>
            {serverStatus}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;