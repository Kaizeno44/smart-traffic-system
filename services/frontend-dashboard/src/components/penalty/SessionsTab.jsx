import React, { useEffect, useState } from 'react';
import { violationService } from '../../services/violationService';
import SessionSummaryCard from '../SessionSummaryCard';

const SessionsTab = ({ onViewViolations }) => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await violationService.getAllSessions();
        setSessions(res?.data?.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return <div className="text-center p-12 text-gray-500">Đang tải danh sách phiên...</div>;
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center p-12 text-gray-400">
        <p className="text-4xl mb-2">📹</p>
        <p className="italic">Chưa có phiên upload nào</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center mb-2">
        <p className="text-sm text-gray-600">
          Tổng cộng <b className="text-blue-600">{sessions.length}</b> phiên
        </p>
      </div>
      {sessions.map((session) => (
        <SessionSummaryCard
          key={session.session_id}
          session={session}
          onViewViolations={onViewViolations}
        />
      ))}
    </div>
  );
};

export default SessionsTab;