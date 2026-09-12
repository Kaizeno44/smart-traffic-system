import React, { useContext, useEffect } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { LayoutDashboard, AlertTriangle, Settings } from 'lucide-react';
// 1. Import Context và thư viện Toast
import { SocketContext } from '../App';
import toast, { Toaster } from 'react-hot-toast';

const MainLayout = () => {
  // 2. Lấy kết nối socket từ App.jsx
  const socket = useContext(SocketContext);

  // 3. Thiết lập lắng nghe sự kiện khi Layout được render
  useEffect(() => {
    if (!socket) return;

    // Hàm xử lý khi có dữ liệu vi phạm bắn về từ Backend
    const handleNewViolation = (data) => {
      // Map tên lỗi sang tiếng Việt cho thân thiện
      const violationName = data.violation_type === 'RED_LIGHT' ? 'Vượt đèn đỏ' : 'Không đội mũ bảo hiểm';
      
      // Hiển thị Pop-up
      toast.error(
        <div>
          <strong className="text-red-600">🚨 Phát hiện vi phạm mới!</strong>
          <p className="text-sm mt-1">Biển số: <span className="font-bold">{data.license_plate}</span></p>
          <p className="text-sm">Lỗi: <span className="font-semibold">{violationName}</span></p>
        </div>,
        { 
          duration: 4000, // Tự động ẩn sau 4 giây
          position: 'top-right' // Hiện ở góc trên bên phải
        }
      );
    };

    // Lắng nghe event 'new_violation'
    socket.on('new_violation', handleNewViolation);

    // Hủy lắng nghe khi chuyển trang để tránh lỗi bộ nhớ
    return () => {
      socket.off('new_violation', handleNewViolation);
    };
  }, [socket]);

  return (
    <div className="flex h-screen bg-gray-100">
      {/* 4. Đặt thẻ Toaster ở đây để pop-up có thể hiển thị đè lên trên mọi thứ */}
      <Toaster />

      <aside className="w-64 bg-gray-800 text-white flex flex-col">
        <div className="p-4 text-2xl font-bold border-b border-gray-700">
          Smart Traffic AI
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <Link to="/" className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-700 transition">
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </Link>
          <Link to="/violations" className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-700 transition">
            <AlertTriangle size={20} />
            <span>Lịch sử vi phạm</span>
          </Link>
          <Link to="/settings" className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-700 transition">
            <Settings size={20} />
            <span>Cài đặt</span>
          </Link>
        </nav>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm h-16 flex items-center justify-between px-6">
          <h1 className="text-xl font-semibold text-gray-800">Hệ thống giám sát giao thông</h1>
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">
              A
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-6">
          <Outlet /> 
        </main>
      </div>
    </div>
  );
};

export default MainLayout;