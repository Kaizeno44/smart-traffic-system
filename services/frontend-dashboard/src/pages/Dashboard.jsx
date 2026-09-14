import React, { useState, useEffect } from 'react';
import { violationService } from '../services/violationService';

const Dashboard = () => {
  // Tạo state để lưu trữ dữ liệu thay đổi
  const [stats, setStats] = useState({
    total: 0,
    today: 0
  });
  const [loading, setLoading] = useState(true);
  const [serverStatus, setServerStatus] = useState('Đang kết nối...');

  useEffect(() => {
    const fetchDashboardStats = async () => {
      try {
        // Gọi API lấy toàn bộ dữ liệu vi phạm
        const response = await violationService.getViolations();
        const dataList = response?.data?.data || response?.data || [];

        // 1. Đếm tổng số lượt xe (vi phạm)
        const total = dataList.length;

        // 2. Tính số vi phạm diễn ra trong HÔM NAY
        // Lấy ngày hiện tại chuẩn múi giờ theo format YYYY-MM-DD
        const todayStr = new Date().toISOString().split('T')[0];
        
        const todayCount = dataList.filter(item => {
          if (!item.violation_time) return false;
          // Cắt lấy phần ngày (YYYY-MM-DD) từ chuỗi thời gian của DB để so sánh
          return item.violation_time.startsWith(todayStr);
        }).length;

        // Cập nhật State để React vẽ lại màn hình
        setStats({ total, today: todayCount });
        setServerStatus('Online'); // Đổi màu xanh nếu kết nối DB thành công
      } catch (error) {
        console.error('Lỗi khi tải dữ liệu thống kê:', error);
        setServerStatus('Offline'); // Báo đỏ nếu rớt mạng / sập Backend
      } finally {
        setLoading(false);
      }
    };

    // Lấy dữ liệu ngay lần đầu mở trang
    fetchDashboardStats();

    // Thiết lập Polling: Tự động cập nhật số liệu mới mỗi 3 giây
    const intervalId = setInterval(fetchDashboardStats, 3000);

    // Xóa interval khi người dùng chuyển sang trang khác để tránh tràn bộ nhớ
    return () => clearInterval(intervalId);
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Tổng quan hệ thống</h2>
      
      {/* Hiển thị dòng chữ báo đang lấy dữ liệu ở lần tải đầu tiên */}
      {loading && <p className="text-gray-500 mb-4 animate-pulse">Đang đồng bộ dữ liệu thời gian thực...</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Khối Tổng số */}
        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-blue-500 transition-all hover:shadow-md">
          <h3 className="text-gray-500 text-sm">Tổng số lượt xe (vi phạm)</h3>
          <p className="text-3xl font-bold">
            {loading ? '...' : stats.total}
          </p>
        </div>
        
        {/* Khối Vi phạm hôm nay */}
        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-red-500 transition-all hover:shadow-md">
          <h3 className="text-gray-500 text-sm">Vi phạm hôm nay</h3>
          <p className="text-3xl font-bold text-red-600">
            {loading ? '...' : stats.today}
          </p>
        </div>
        
        {/* Khối Trạng thái Hệ thống */}
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