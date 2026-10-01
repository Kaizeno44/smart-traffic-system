import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import OverviewTab from '../components/penalty/OverviewTab';
import SessionsTab from '../components/penalty/SessionsTab';
import TopViolatorsTab from '../components/penalty/TopViolatorsTab';

const TABS = [
  { id: 'overview', label: '📊 Tổng quan', icon: '📊' },
  { id: 'sessions', label: '📹 Phiên upload', icon: '📹' },
  { id: 'violators', label: '🏆 Top vi phạm', icon: '🏆' },
];

const PenaltyManagement = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const navigate = useNavigate();

  // Click "Xem chi tiết vi phạm" trong session → chuyển sang trang Lịch sử + filter
  const handleViewSessionViolations = (sessionId) => {
    // Chuyển sang trang Violations với query param
    navigate(`/violations?session=${encodeURIComponent(sessionId)}`);
  };

  return (
    <div className="p-0 sm:p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 px-2 sm:px-0">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">
          💰 Quản lý phạt
        </h2>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">
          Thống kê, tổng hợp và phân tích vi phạm giao thông
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow mb-6 overflow-hidden border border-gray-100 mx-2 sm:mx-0">
        <div className="flex overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-[140px] px-4 py-3 text-sm font-medium transition whitespace-nowrap border-b-2 ${
                activeTab === tab.id
                  ? 'text-blue-600 border-blue-600 bg-blue-50'
                  : 'text-gray-600 border-transparent hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-2 sm:px-0">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'sessions' && (
          <SessionsTab onViewViolations={handleViewSessionViolations} />
        )}
        {activeTab === 'violators' && <TopViolatorsTab />}
      </div>
    </div>
  );
};

export default PenaltyManagement;