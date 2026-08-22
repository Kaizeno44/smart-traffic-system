import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import Violations from './pages/Violations';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="violations" element={<Violations />} />
          {/* thêm các route khác vào đây sau */}
        </Route>
      </Routes>
    </Router>
  );
}

export default App;