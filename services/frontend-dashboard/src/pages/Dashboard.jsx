import React from 'react';

const Dashboard = () => {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Tổng quan hệ thống</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-blue-500">
          <h3 className="text-gray-500 text-sm">Tổng số lượt xe</h3>
          <p className="text-3xl font-bold">1,245</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-red-500">
          <h3 className="text-gray-500 text-sm">Vi phạm hôm nay</h3>
          <p className="text-3xl font-bold text-red-600">32</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-green-500">
          <h3 className="text-gray-500 text-sm">Trạng thái Camera</h3>
          <p className="text-3xl font-bold text-green-600">Online</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;