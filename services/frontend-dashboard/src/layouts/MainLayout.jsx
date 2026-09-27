import React, { useContext, useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  AlertTriangle, 
  Settings, 
  Upload, 
  Menu, 
  X 
} from 'lucide-react';
import { SocketContext } from '../App';
import toast, { Toaster } from 'react-hot-toast';

const MainLayout = () => {
  const socket = useContext(SocketContext);
  const location = useLocation();
  
  // State quản lý việc đóng/mở menu trên Mobile
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Tự động đóng Sidebar khi chuyển trang trên Mobile
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname]);

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
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <Toaster />

      {/* OVERLAY: Lớp phủ đen mờ khi mở menu trên điện thoại */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* SIDEBAR */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-gray-800 text-white flex flex-col transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 h-16 flex items-center justify-between border-b border-gray-700">
          <span className="text-xl font-bold truncate">Smart Traffic AI</span>
          {/* Nút đóng Sidebar trên Mobile */}
          <button 
            className="p-1 rounded-md hover:bg-gray-700 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <NavLink to="/" end className={navLinkClass}>
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </NavLink>

          <NavLink to="/violations" className={navLinkClass}>
            <AlertTriangle size={20} />
            <span>Lịch sử vi phạm</span>
          </NavLink>

          <NavLink to="/upload" className={navLinkClass}>
            <Upload size={20} />
            <span>Upload Video</span>
          </NavLink>

          <NavLink to="/settings" className={navLinkClass}>
            <Settings size={20} />
            <span>Cài đặt</span>
          </NavLink>
        </nav>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        
        {/* HEADER */}
        <header className="bg-white shadow-sm h-16 shrink-0 flex items-center justify-between px-4 lg:px-6 z-10">
          <div className="flex items-center gap-3">
            {/* Nút mở Menu Hamburger (Chỉ hiện trên Mobile) */}
            <button 
              className="p-2 -ml-2 rounded-md hover:bg-gray-100 lg:hidden text-gray-600"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu size={24} />
            </button>
            
            <h1 className="text-lg lg:text-xl font-semibold text-gray-800 truncate max-w-[200px] sm:max-w-md md:max-w-full">
              Hệ thống giám sát giao thông
            </h1>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold shadow-sm">
              A
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default MainLayout;