import React, { useEffect, useState } from 'react';
import { violationService } from '../../services/violationService';

const OverviewTab = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await violationService.getPenaltyOverview();
        setData(res?.data?.data || null);
      } catch (err) {
        console.error(err);
        setError('Không thể tải dữ liệu thống kê');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const formatTypeName = (type) => {
    const map = {
      'NO_HELMET': 'Không đội mũ bảo hiểm',
      'RED_LIGHT': 'Vượt đèn đỏ',
      'OVERLOAD': 'Chở quá số người',
      'PHONE_USE': 'Dùng điện thoại',
      'WHEELIE': 'Bốc đầu',
      'ZIGZAG': 'Lạng lách',
    };
    return map[type] || type;
  };

  const formatDay = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-12 text-gray-500">
        <svg className="animate-spin h-8 w-8 text-blue-600 mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
        Đang tải...
      </div>
    );
  }

  if (error) {
    return <div className="p-6 text-red-600 bg-red-50 rounded">{error}</div>;
  }

  if (!data) return null;

  const { overview, by_type = [], by_day = [] } = data;

  return (
    <div className="space-y-6">
      {/* ==== STAT CARDS ==== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-5 text-white shadow-lg">
          <p className="text-xs uppercase opacity-90 font-medium mb-1">Tổng vi phạm</p>
          <p className="text-3xl font-bold">{overview.total_violations}</p>
          <p className="text-xs opacity-80 mt-1">{overview.unique_vehicles} xe unique</p>
        </div>

        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-lg p-5 text-white shadow-lg">
          <p className="text-xs uppercase opacity-90 font-medium mb-1">Tổng tiền phạt</p>
          <p className="text-xl font-bold leading-tight">{overview.total_fine_text}</p>
        </div>

        <div className="bg-gradient-to-br from-yellow-500 to-orange-500 rounded-lg p-5 text-white shadow-lg">
          <p className="text-xs uppercase opacity-90 font-medium mb-1">Chờ xử lý</p>
          <p className="text-3xl font-bold">{overview.pending_count}</p>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-5 text-white shadow-lg">
          <p className="text-xs uppercase opacity-90 font-medium mb-1">Đã xác nhận</p>
          <p className="text-3xl font-bold">{overview.confirmed_count}</p>
        </div>
      </div>

      {/* ==== BY TYPE ==== */}
      <div className="bg-white rounded-lg shadow p-5 border border-gray-100">
        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
          📊 Thống kê theo loại vi phạm
        </h3>
        <div className="space-y-3">
          {by_type.map((item, idx) => {
            const percent = overview.total_violations > 0
              ? (item.count / overview.total_violations) * 100
              : 0;
            return (
              <div key={idx}>
                <div className="flex justify-between items-center mb-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-700">
                      {formatTypeName(item.violation_type)}
                    </span>
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
                      {item.count}
                    </span>
                  </div>
                  <span className="text-red-600 font-bold text-sm">
                    {item.total_text}
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-red-400 to-red-600 h-full rounded-full transition-all"
                    style={{ width: `${percent}%` }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ==== BY DAY ==== */}
      <div className="bg-white rounded-lg shadow p-5 border border-gray-100">
        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
          📅 Vi phạm 7 ngày gần nhất
        </h3>
        {by_day.length === 0 ? (
          <p className="text-gray-400 italic text-center py-4">Chưa có dữ liệu</p>
        ) : (
          <div className="space-y-3">
            {by_day.map((day, idx) => {
              const maxCount = Math.max(...by_day.map(d => d.count), 1);
              const percent = (day.count / maxCount) * 100;
              return (
                <div key={idx} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-14 font-mono">
                    {formatDay(day.day)}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden relative">
                    <div
                      className="bg-gradient-to-r from-blue-400 to-blue-600 h-full rounded-full transition-all flex items-center justify-end pr-2"
                      style={{ width: `${percent}%` }}
                    >
                      <span className="text-xs font-bold text-white">
                        {day.count}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-gray-600 w-32 text-right font-medium">
                    {day.total_min.toLocaleString('vi-VN')}đ+
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default OverviewTab;