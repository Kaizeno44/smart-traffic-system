import React, { useEffect, useState } from 'react';
import { violationService } from '../../services/violationService';

const TopViolatorsTab = () => {
  const [violators, setViolators] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await violationService.getTopViolators(10);
        setViolators(res?.data?.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const formatTypeShort = (type) => {
    const map = {
      'NO_HELMET': 'Không mũ',
      'RED_LIGHT': 'Đèn đỏ',
      'OVERLOAD': 'Quá người',
      'PHONE_USE': 'Điện thoại',
      'WHEELIE': 'Bốc đầu',
      'ZIGZAG': 'Lạng lách',
    };
    return map[type] || type;
  };

  const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('vi-VN');
  };

  if (loading) {
    return <div className="text-center p-12 text-gray-500">Đang tải...</div>;
  }

  if (violators.length === 0) {
    return (
      <div className="text-center p-12 text-gray-400">
        <p className="text-4xl mb-2">🏆</p>
        <p className="italic">Chưa có dữ liệu</p>
      </div>
    );
  }

  const getMedal = (index) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `#${index + 1}`;
  };

  return (
    <div className="space-y-3">
      {violators.map((v, idx) => (
        <div
          key={v.license_plate}
          className={`bg-white rounded-lg shadow p-4 border-l-4 hover:shadow-md transition ${
            idx === 0 ? 'border-red-500' :
            idx === 1 ? 'border-orange-400' :
            idx === 2 ? 'border-yellow-400' : 'border-gray-300'
          }`}
        >
          <div className="flex items-center gap-4">
            <div className="text-3xl w-12 text-center shrink-0">
              {getMedal(idx)}
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-bold text-red-600 text-lg font-mono truncate">
                {v.license_plate}
              </p>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
                  {v.violation_count} vi phạm
                </span>
                {v.violation_types.map((t, i) => (
                  <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                    {formatTypeShort(t)}
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Lần cuối: {formatTime(v.last_violation_time)}
              </p>
            </div>

            <div className="text-right shrink-0">
              <p className="text-xs text-gray-500 uppercase">Tổng phạt</p>
              <p className="font-bold text-red-600 whitespace-nowrap">
                {v.total_text}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default TopViolatorsTab;