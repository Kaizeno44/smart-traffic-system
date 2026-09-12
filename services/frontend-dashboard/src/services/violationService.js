import api from './api';

export const violationService = {
  // Lấy danh sách vi phạm
  getViolations: async () => {
    try {
      const response = await api.get('/violations');
      return response; 
    } catch (error) {
      console.error("Lỗi khi gọi API getViolations:", error);
      throw error;
    }
  },

  // Cập nhật trạng thái xác nhận vi phạm
  updateStatus: async (id, status) => {
    try {
      const response = await api.put(`/violations/${id}/status`, { status });
      return response;
    } catch (error) {
      console.error(`Lỗi khi gọi API updateStatus cho xe ID ${id}:`, error);
      throw error;
    }
  }
};