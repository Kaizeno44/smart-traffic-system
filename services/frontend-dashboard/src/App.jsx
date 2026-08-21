import { useState, useEffect } from 'react'
import axios from 'axios'
import './App.css'

function App() {
  const [violations, setViolations] = useState([])

  const fetchViolations = () => {
    axios.get('http://localhost:3000/api/violations')
      .then(response => {
        if (response.data.success) {
          setViolations(response.data.data)
        }
      })
      .catch(error => console.error("Lỗi:", error))
  }

  useEffect(() => {
    fetchViolations()
  }, [])

  const handleConfirm = (id) => {
    axios.put(`http://localhost:3000/api/violations/${id}/status`, {
      status: 'Confirmed'
    }).then(response => {
      if (response.data.success) fetchViolations()
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans text-gray-800">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Quản lý vi phạm giao thông</h1>
          <p className="text-gray-500 mt-2">Hệ thống giám sát và phân tích dữ liệu tự động từ Camera AI</p>
        </div>
        
        <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-200">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-700 text-sm uppercase tracking-wider">
                <th className="p-4 font-semibold border-b">ID</th>
                <th className="p-4 font-semibold border-b">Biển số</th>
                <th className="p-4 font-semibold border-b">Loại xe</th>
                <th className="p-4 font-semibold border-b">Lỗi vi phạm</th>
                <th className="p-4 font-semibold border-b">Thời gian</th>
                <th className="p-4 font-semibold border-b">Trạng thái</th>
                <th className="p-4 font-semibold border-b">Bằng chứng</th>
                <th className="p-4 font-semibold border-b text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {violations.map((v) => (
                <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4 text-gray-600">{v.id}</td>
                  <td className="p-4 font-bold text-red-600 text-lg">{v.license_plate}</td>
                  <td className="p-4 text-gray-600">{v.vehicle_type}</td>
                  <td className="p-4">
                    <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-medium">
                      {v.violation_type}
                    </span>
                  </td>
                  <td className="p-4 text-gray-500">{new Date(v.violation_time).toLocaleString('vi-VN')}</td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${v.status === 'Confirmed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {v.status}
                    </span>
                  </td>
                  <td className="p-4">
                    {v.panorama_image_path ? (
                      <img 
                        src={`http://localhost:3000${v.panorama_image_path}`} 
                        alt="Toàn cảnh" 
                        className="w-32 h-20 object-cover rounded-lg border border-gray-300 shadow-sm"
                      />
                    ) : (
                      <span className="text-gray-400 italic">Trống</span>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    {v.status === 'Pending' && (
                      <button 
                        onClick={() => handleConfirm(v.id)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
                      >
                        Xác nhận
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default App