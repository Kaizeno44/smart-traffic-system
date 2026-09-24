import React, { useContext, useEffect } from 'react';
import { Outlet, Link, NavLink } from 'react-router-dom';
import { LayoutDashboard, AlertTriangle, Settings, Upload } from 'lucide-react';
import { SocketContext } from '../App';
import toast, { Toaster } from 'react-hot-toast';

const MainLayout = () => {
  const socket = useContext(SocketContext);

  useEffect(() => {
    if (!socket) return;

    const handleNewViolation = (data) => {
      const violationName = data.violation_type === 'RED_LIGHT' 
        ? 'Vượt đèn đỏ' 
        : data.violation_type === 'OVERLOAD'
          ? 'Chở quá số người'
          : 'Không đội mũ bảo hiểm';
      
      toast.error(
        <div>
          <strong className="text-red-600">🚨 Phát hiện vi phạm mới!</strong>
          <p className="text-sm mt-1">Biển số: <span className="font-bold">{data.license_plate}</span></p>
          <p className="text-sm">Lỗi: <span className="font-semibold">{violationName}</span></p>
        </div>,
        { 
          duration: 4000,
          position: 'top-right'
        }
      );
    };

    socket.on('new_violation', handleNewViolation);

    return () => {
      socket.off('new_violation', handleNewViolation);
    };
  }, [socket]);

  // Helper: nav link với active state
  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-3 p-3 rounded-lg transition ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'hover:bg-gray-700 text-gray-300'
    }`;

  return (
    <div className="flex h-screen bg-gray-100">
      <Toaster />

      <aside className="w-64 bg-gray-800 text-white flex flex-col">
        <div className="p-4 text-2xl font-bold border-b border-gray-700">
          Smart Traffic AI
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {/* Dashboard */}
          <NavLink to="/" end className={navLinkClass}>
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </NavLink>

          {/* Lịch sử vi phạm */}
          <NavLink to="/violations" className={navLinkClass}>
            <AlertTriangle size={20} />
            <span>Lịch sử vi phạm</span>
          </NavLink>

          {/* ✅ THÊM: Upload Video */}
          <NavLink to="/upload" className={navLinkClass}>
            <Upload size={20} />
            <span>Upload Video</span>
          </NavLink>

          {/* Cài đặt */}
          <NavLink to="/settings" className={navLinkClass}>
            <Settings size={20} />
            <span>Cài đặt</span>
          </NavLink>
        </nav>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm h-16 flex items-center justify-between px-6">
          <h1 className="text-xl font-semibold text-gray-800">
            Hệ thống giám sát giao thông
          </h1>
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