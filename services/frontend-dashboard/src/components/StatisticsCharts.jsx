import React, { useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';

const COLORS = {
  NO_HELMET: '#ef4444',   // đỏ
  RED_LIGHT: '#f59e0b',   // vàng cam
};

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];


const StatisticsCharts = ({ violations }) => {
  // ============ 1. Bar chart: vi phạm theo giờ ============
  const hourlyData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: `${i}h`,
      count: 0,
    }));

    violations.forEach((v) => {
      if (!v.violation_time) return;
      const h = new Date(v.violation_time).getHours();
      if (h >= 0 && h < 24) hours[h].count += 1;
    });

    return hours;
  }, [violations]);

  // ============ 2. Line chart: 7 ngày gần nhất ============
  const dailyData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      days.push({
        date: `${d.getDate()}/${d.getMonth() + 1}`,
        key,
        count: 0,
      });
    }

    violations.forEach((v) => {
      if (!v.violation_time) return;
      const key = v.violation_time.split('T')[0];
      const found = days.find((d) => d.key === key);
      if (found) found.count += 1;
    });

    return days;
  }, [violations]);

  // ============ 3. Pie chart: tỉ lệ loại vi phạm ============
  const pieData = useMemo(() => {
    const counts = { NO_HELMET: 0, RED_LIGHT: 0 };
    violations.forEach((v) => {
      if (v.violation_type in counts) counts[v.violation_type] += 1;
    });
    return [
      { name: 'Không đội mũ', value: counts.NO_HELMET, type: 'NO_HELMET' },
      { name: 'Vượt đèn đỏ', value: counts.RED_LIGHT, type: 'RED_LIGHT' },
    ].filter((d) => d.value > 0);
  }, [violations]);

  // ============ 4. Top 5 biển số ============
  const topPlates = useMemo(() => {
    const counts = {};
    violations.forEach((v) => {
      const p = v.license_plate;
      if (!p || p === 'CHUA_RO_BS' || p === '') return;
      counts[p] = (counts[p] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([plate, count]) => ({ plate, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [violations]);

  // ============ RENDER ============
  if (!violations || violations.length === 0) {
    return (
      <div className="bg-white p-8 rounded-lg shadow text-center text-gray-500">
        <p className="text-lg">Chưa có dữ liệu vi phạm để thống kê.</p>
        <p className="text-sm mt-1">Chạy video để bắt đầu thu thập dữ liệu.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

      {/* ===== Chart 1: Vi phạm theo giờ ===== */}
      <div className="bg-white p-5 rounded-lg shadow-sm border">
        <h3 className="font-semibold text-gray-700 mb-3">
          📊 Vi phạm theo giờ trong ngày
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={hourlyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="hour" fontSize={11} />
            <YAxis allowDecimals={false} fontSize={11} />
            <Tooltip />
            <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ===== Chart 2: Xu hướng 7 ngày ===== */}
      <div className="bg-white p-5 rounded-lg shadow-sm border">
        <h3 className="font-semibold text-gray-700 mb-3">
          📈 Xu hướng 7 ngày gần nhất
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={dailyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="date" fontSize={11} />
            <YAxis allowDecimals={false} fontSize={11} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="count"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ===== Chart 3: Tỉ lệ loại vi phạm ===== */}
      <div className="bg-white p-5 rounded-lg shadow-sm border">
        <h3 className="font-semibold text-gray-700 mb-3">
          🥧 Tỉ lệ loại vi phạm
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={80}
              label={(entry) => `${entry.name}: ${entry.value}`}
              labelLine={false}
            >
              {pieData.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={COLORS[entry.type] || PIE_COLORS[idx]}
                />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* ===== Chart 4: Top 5 biển số ===== */}
      <div className="bg-white p-5 rounded-lg shadow-sm border">
        <h3 className="font-semibold text-gray-700 mb-3">
          🏆 Top 5 biển số vi phạm nhiều nhất
        </h3>
        {topPlates.length === 0 ? (
          <p className="text-gray-400 text-center py-8">
            Chưa có biển số nào vi phạm nhiều lần.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart
              data={topPlates}
              layout="vertical"
              margin={{ left: 20, right: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" allowDecimals={false} fontSize={11} />
              <YAxis
                dataKey="plate"
                type="category"
                width={100}
                fontSize={11}
              />
              <Tooltip />
              <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

    </div>
  );
};

export default StatisticsCharts;