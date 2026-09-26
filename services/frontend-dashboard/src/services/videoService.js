import api from './api';

const VIDEO_API = '/videos';

export const videoService = {
  uploadVideo: async (file, onProgress) => {
    const formData = new FormData();
    formData.append('video', file);

    // Sử dụng 'api' thay vì 'axios'
    return api.post(`${VIDEO_API}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded * 100) / e.total));
        }
      },
      timeout: 300000,
    });
  },

  getPendingVideos: () => api.get(`${VIDEO_API}/pending`),
  
  getProcessedVideos: () => api.get(`${VIDEO_API}/processed`),

  deleteVideo: (filename, type = 'pending') =>
    api.delete(`${VIDEO_API}/${encodeURIComponent(filename)}?type=${type}`),

  getVideoMetadata: (filename) =>
    api.get(`${VIDEO_API}/metadata/${encodeURIComponent(filename)}`),

  cancelProcessing: (filename) =>
    api.post(`${VIDEO_API}/cancel/${encodeURIComponent(filename)}`),

  getStreamUrl: (filename, type = 'processed') => {
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
    return `${API_BASE}${VIDEO_API}/stream/${encodeURIComponent(filename)}?type=${type}`;
  },
};