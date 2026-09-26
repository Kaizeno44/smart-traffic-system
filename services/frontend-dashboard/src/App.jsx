import { createContext, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { io } from 'socket.io-client';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import Violations from './pages/Violations';
import UploadVideo from './pages/UploadVideo';

// 1. Tao Context de chia se ket noi Socket cho toan bo cac trang
export const SocketContext = createContext();

// 2. Khoi tao ket noi Socket linh hoat tu bien moi truong (.env)
// Neu VITE_API_URL la "http://localhost:3000/api", no se cat bo "/api" de lay url goc cho socket
const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3000';
const socket = io(SOCKET_URL);

function App() {
  useEffect(() => {
    // Kiem tra ket noi khi App vua chay
    socket.on('connect', () => {
      console.log(`Frontend da ket noi Socket.io toi: ${SOCKET_URL}`);
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
            <Route path="upload" element={<UploadVideo />} />
            {/* them cac route khac vao day sau */}
          </Route>
        </Routes>
      </Router>
    </SocketContext.Provider>
  );
}

export default App;