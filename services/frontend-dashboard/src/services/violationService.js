import api from './api';

export const violationService = {
  getViolations: async () => {
    try {
      const response = await api.get('/violations');
      return response;
    } catch (error) {
      console.error("Lỗi khi gọi API getViolations:", error);
      throw error;
    }
  },

  updateStatus: async (id, status) => {
    try {
      const response = await api.put(`/violations/${id}/status`, { status });
      return response;
    } catch (error) {
      console.error(`Lỗi khi gọi API updateStatus cho xe ID ${id}:`, error);
      throw error;
    }
  },

  getAllSessions: async () => {
    try {
      const response = await api.get('/violations/sessions');
      return response;
    } catch (error) {
      console.error("Lỗi khi gọi API getAllSessions:", error);
      throw error;
    }
  },

  getSessionSummary: async (sessionId) => {
    try {
      const response = await api.get(`/violations/sessions/${encodeURIComponent(sessionId)}`);
      return response;
    } catch (error) {
      console.error(`Lỗi khi gọi API getSessionSummary cho session ${sessionId}:`, error);
      throw error;
    }
  },

  // ✅ MỚI — Thống kê tổng quan
  getPenaltyOverview: async () => {
    try {
      const response = await api.get('/violations/stats/overview');
      return response;
    } catch (error) {
      console.error("Lỗi khi gọi API getPenaltyOverview:", error);
      throw error;
    }
  },

  // ✅ MỚI — Top xe vi phạm
  getTopViolators: async (limit = 10) => {
    try {
      const response = await api.get(`/violations/stats/top-violators?limit=${limit}`);
      return response;
    } catch (error) {
      console.error("Lỗi khi gọi API getTopViolators:", error);
      throw error;
    }
  },
};