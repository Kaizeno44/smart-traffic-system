import { createContext, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { io } from 'socket.io-client';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import Violations from './pages/Violations';

// 1. Tao Context de chia se ket noi Socket cho toan bo cac trang
export const SocketContext = createContext();

// 2. Khoi tao ket noi Socket o ngoai Component de tranh bi render lai nhieu lan
const socket = io('http://localhost:3000');

function App() {
  useEffect(() => {
    // Kiem tra ket noi khi App vua chay
    socket.on('connect', () => {
      console.log('Frontend da ket noi Socket.io voi Backend thanh cong!');
    });

    return () => {
      socket.off('connect');
    };
  }, []);

  return (
    // 3. Boc toan bo Router bang SocketContext.Provider
    <SocketContext.Provider value={socket}>
      <Router>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="violations" element={<Violations />} />
            {/* them cac route khac vao day sau */}
          </Route>
        </Routes>
      </Router>
    </SocketContext.Provider>
  );
}

export default App;