import api from './api';

export const violationService = {
  getViolations: async () => {
    try {
      const response = await api.get('/violations');
      return response; 
    } catch (error) {
      throw error;
    }
  },

  updateStatus: async (id, status) => {
    try {
      const response = await api.put(`/violations/${id}/status`, { status });
      return response;
    } catch (error) {
      throw error;
    }
  }
};