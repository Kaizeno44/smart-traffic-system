import React from 'react';

// ============ HELPERS ============

// Chuẩn hoá loại xe
const formatVehicleType = (type) => {
  const map = {
    'motorbike': 'Xe máy',
    'xe may': 'Xe máy',
    'xe máy': 'Xe máy',
    'car': 'Ô tô',
    'ô tô': 'Ô tô',
  };
  return map[type?.toLowerCase()] || type || 'Không rõ';
};

// Chuẩn hoá loại vi phạm — CÓ DẤU
const formatViolationError = (error) => {
  const map = {
    'no_helmet': 'Không đội mũ bảo hiểm',
    'red_light': 'Vượt đèn đỏ',
    'overload': 'Chở quá số người',
    // ✅ MỚI — Chuẩn bị cho các vi phạm tương lai
    'phone_use': 'Dùng điện thoại',
    'wrong_lane': 'Đi sai làn',
    'wrong_way': 'Đi ngược chiều',
    'wheelie': 'Bốc đầu',
    'zigzag': 'Lạng lách',
  };
  return map[error?.toLowerCase()] || error;
};

// Trạng thái có dấu
const formatStatus = (status) => {
  const map = {
    'pending': 'Chờ xử lý',
    'confirmed': 'Đã xác nhận',
  };
  return map[status?.toLowerCase()] || status;
};

// Định dạng thời gian
const formatTime = (timeString) => {
  if (!timeString) return '';
  try {
    const date = new Date(timeString);
    const time = date.toLocaleTimeString('vi-VN', { hour12: false });
    const day = date.toLocaleDateString('vi-VN');
    return `${time} ${day}`;
  } catch {
    return timeString;
  }
};

// ✅ MỚI — Format mức phạt
const formatFine = (row) => {
  // Ưu tiên dùng fine_text có sẵn từ BE
  if (row.fine_text && row.fine_text.trim() !== '') {
    return row.fine_text;
  }
  // Fallback: format từ fine_min / fine_max
  const min = parseInt(row.fine_min) || 0;
  const max = parseInt(row.fine_max) || 0;
  if (min === 0 && max === 0) return null;
  
  const fmt = (n) => n.toLocaleString('vi-VN') + 'đ';
  if (min === max) return fmt(min);
  return `${fmt(min)} - ${fmt(max)}`;
};


// ============ SORT ICON ============
const SortIcon = ({ column, sortBy, sortOrder }) => {
  if (sortBy !== column) {
    return <span className="text-gray-300 ml-1 text-xs">↕</span>;
  }
  return sortOrder === 'asc'
    ? <span className="text-blue-600 ml-1 text-xs font-bold">↑</span>
    : <span className="text-blue-600 ml-1 text-xs font-bold">↓</span>;
};


// ============ COMPONENT ============
const ViolationTable = ({
  data = [],
  onConfirm,
  processingId,
  onViewDetail,
  onSort,
  sortBy,
  sortOrder,
}) => {
  const BASE_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3000';

  const handleImageError = (e) => {
    e.target.src = 'https://via.placeholder.com/150x100?text=Loi+anh';
  };

  const getImageUrl = (path) => {
    if (!path) return 'https://via.placeholder.com/150x100?text=No+Image';
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    return `${BASE_URL}/${cleanPath}`;
  };

  // Header có thể click để sort
  const SortableHeader = ({ column, label, align = 'left', className = '' }) => (
    <th
      onClick={() => onSort && onSort(column)}
      className={`px-4 py-3 font-medium text-gray-500 uppercase select-none ${
        onSort ? 'cursor-pointer hover:bg-gray-100 transition' : ''
      } ${align === 'center' ? 'text-center' : 'text-left'} ${className}`}
    >
      {label}
      {onSort && <SortIcon column={column} sortBy={sortBy} sortOrder={sortOrder} />}
    </th>
  );

  return (
    <div className="bg-white rounded-lg shadow w-full overflow-hidden border border-gray-100">
      <div className="overflow-x-auto w-full">
        <table className="min-w-max w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <SortableHeader column="id" label="ID" />
              <SortableHeader column="license_plate" label="Biển số" />
              <SortableHeader column="vehicle_type" label="Loại xe" />
              <SortableHeader column="violation_type" label="Lỗi vi phạm" />
              {/* ✅ MỚI — Cột mức phạt */}
              <SortableHeader column="fine_min" label="Mức phạt" />
              <SortableHeader column="violation_time" label="Thời gian" />
              <SortableHeader column="status" label="Trạng thái" />
              <th className="px-4 py-3 text-center font-medium text-gray-500 uppercase">
                Bằng chứng
              </th>
              <th className="px-4 py-3 text-center font-medium text-gray-500 uppercase">
                Thao tác
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map((row) => {
              const fineText = formatFine(row);
              return (
                <tr key={row.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-4 text-gray-900 font-medium">{row.id}</td>

                  <td className="px-4 py-4 font-bold text-red-600 whitespace-nowrap">
                    {row.license_plate || <span className="text-gray-400 italic">Chưa rõ</span>}
                  </td>

                  <td className="px-4 py-4 text-gray-600 whitespace-nowrap">
                    {formatVehicleType(row.vehicle_type)}
                  </td>

                  <td className="px-4 py-4">
                    <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap">
                      {formatViolationError(row.violation_type)}
                    </span>
                  </td>

                  {/* ✅ MỚI — Cell mức phạt */}
                  <td className="px-4 py-4 whitespace-nowrap">
                    {fineText ? (
                      <div className="flex flex-col">
                        <span className="text-red-700 font-bold text-sm">
                          {fineText}
                        </span>
                        {row.legal_basis && (
                          <span
                            className="text-gray-400 text-[10px] mt-0.5 truncate max-w-[180px]"
                            title={row.legal_basis}
                          >
                            {row.legal_basis}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400 italic text-xs">Chưa xác định</span>
                    )}
                  </td>

                  <td className="px-4 py-4 text-gray-500 whitespace-nowrap">
                    {formatTime(row.violation_time)}
                  </td>

                  <td className="px-4 py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                        row.status === 'Confirmed'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {formatStatus(row.status)}
                    </span>
                  </td>

                  <td className="px-4 py-2">
                    <div className="flex justify-center">
                      {row.video_path ? (
                        <video
                          src={getImageUrl(row.video_path)}
                          controls
                          preload="metadata"
                          className="h-20 w-32 object-cover rounded border bg-black shrink-0"
                        />
                      ) : (
                        <img
                          src={getImageUrl(row.panorama_image_path)}
                          alt="Bằng chứng"
                          className="h-16 w-24 object-cover rounded border shrink-0"
                          onError={handleImageError}
                        />
                      )}
                    </div>
                  </td>

                  <td className="px-4 py-4">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => onViewDetail && onViewDetail(row)}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-sm font-medium transition whitespace-nowrap"
                      >
                        Chi tiết
                      </button>

                      {row.status === 'Pending' && (
                        <button
                          onClick={() => onConfirm(row.id)}
                          disabled={processingId === row.id}
                          className={`px-3 py-1.5 rounded text-sm font-medium transition text-white whitespace-nowrap ${
                            processingId === row.id
                              ? 'bg-gray-400 cursor-not-allowed'
                              : 'bg-blue-600 hover:bg-blue-700'
                          }`}
                        >
                          {processingId === row.id ? 'Đang xử lý...' : 'Xác nhận'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {data.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            Không có dữ liệu vi phạm.
          </div>
        )}
      </div>
    </div>
  );
};

export default ViolationTable;