import React from 'react';
import { Eye } from 'lucide-react';

const mockData = [
  { id: 1, plate: '29A-123.45', type: 'Không đội mũ bảo hiểm', time: '2023-10-25 08:30:00', status: 'Chưa xử lý' },
  { id: 2, plate: '30F-987.65', type: 'Vượt đèn đỏ', time: '2023-10-25 09:15:22', status: 'Đã xử lý' },
  { id: 3, plate: '51G-555.55', type: 'Không đội mũ bảo hiểm', time: '2023-10-25 10:05:10', status: 'Chưa xử lý' },
];

const ViolationTable = ({ onViewDetail }) => {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Biển số</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Loại lỗi</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Thời gian</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trạng thái</th>
            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Hành động</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {mockData.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap font-semibold text-gray-900">{row.plate}</td>
              <td className="px-6 py-4 whitespace-nowrap text-red-600">{row.type}</td>
              <td className="px-6 py-4 whitespace-nowrap text-gray-500">{row.time}</td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                  row.status === 'Đã xử lý' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {row.status}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                <button 
                  onClick={() => onViewDetail(row)}
                  className="text-blue-600 hover:text-blue-900 flex items-center justify-center gap-1 w-full"
                >
                  <Eye size={18} /> Chi tiết
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ViolationTable;