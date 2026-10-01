import React, { useState } from 'react';

const SessionSummaryCard = ({ session, onViewViolations }) => {
  const [expanded, setExpanded] = useState(false);

  if (!session) return null;

  const {
    session_id,
    violation_count,
    total_fine_text,
    last_violation_time,
    violation_types = [],
    license_plates = [],
  } = session;

  const formatTime = (iso) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleString('vi-VN');
    } catch {
      return iso;
    }
  };

  const shortenSessionName = (name) => {
    if (!name) return '';
    if (name.length <= 30) return name;
    return name.substring(0, 15) + '...' + name.substring(name.length - 12);
  };

  const formatViolationType = (type) => {
    const map = {
      'NO_HELMET': 'Không mũ',
      'RED_LIGHT': 'Vượt đèn đỏ',
      'OVERLOAD': 'Chở quá người',
      'PHONE_USE': 'Dùng ĐT',
      'WHEELIE': 'Bốc đầu',
      'ZIGZAG': 'Lạng lách',
    };
    return map[type] || type;
  };

  const countBadgeColor = violation_count >= 3
    ? 'bg-red-100 text-red-700 border-red-300'
    : violation_count === 2
      ? 'bg-orange-100 text-orange-700 border-orange-300'
      : 'bg-blue-100 text-blue-700 border-blue-300';

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 mb-3 hover:shadow-md transition">
      <div
        className="p-4 cursor-pointer flex items-center gap-4"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="text-3xl shrink-0">📹</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p
              className="font-semibold text-gray-800 text-sm truncate"
              title={session_id}
            >
              {shortenSessionName(session_id)}
            </p>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-bold border ${countBadgeColor} whitespace-nowrap`}
            >
              {violation_count} vi phạm
            </span>
          </div>
          <p className="text-xs text-gray-500">
            {formatTime(last_violation_time)}
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className="text-xs text-gray-500 uppercase">Tổng phạt</p>
          <p className="text-lg font-bold text-red-600 whitespace-nowrap">
            {total_fine_text}
          </p>
        </div>

        <div className="text-gray-400 shrink-0 text-xl">
          {expanded ? '▲' : '▼'}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-200 bg-gray-50 p-4 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <p className="text-xs text-gray-500 mb-1">Loại vi phạm</p>
              <div className="flex flex-wrap gap-1">
                {violation_types.length > 0 ? (
                  violation_types.map((t, i) => (
                    <span
                      key={i}
                      className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-medium"
                    >
                      {formatViolationType(t)}
                    </span>
                  ))
                ) : (
                  <span className="text-gray-400 italic text-xs">Không rõ</span>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Biển số liên quan</p>
              <div className="flex flex-wrap gap-1">
                {license_plates.length > 0 ? (
                  license_plates.map((p, i) => (
                    <span
                      key={i}
                      className="bg-gray-200 text-gray-800 px-2 py-0.5 rounded text-xs font-mono font-medium"
                    >
                      {p}
                    </span>
                  ))
                ) : (
                  <span className="text-gray-400 italic text-xs">Chưa rõ</span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewViolations && onViewViolations(session_id);
            }}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium transition"
          >
            🔍 Xem chi tiết vi phạm
          </button>
        </div>
      )}
    </div>
  );
};

export default SessionSummaryCard;