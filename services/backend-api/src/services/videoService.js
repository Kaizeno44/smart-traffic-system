import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const VIDEO_API = `${API_BASE}/videos`;

export const videoService = {
  // Upload video
  uploadVideo: async (file, onProgress) => {
    const formData = new FormData();
    formData.append('video', file);

    return axios.post(`${VIDEO_API}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded * 100) / e.total));
        }
      },
      timeout: 300000,   // 5 phút cho video lớn
    });
  },

  // Danh sách chờ xử lý
  getPendingVideos: () => axios.get(`${VIDEO_API}/pending`),

  // Danh sách đã xử lý
  getProcessedVideos: () => axios.get(`${VIDEO_API}/processed`),

  // Xóa video
  deleteVideo: (filename, type = 'pending') =>
    axios.delete(`${VIDEO_API}/${filename}?type=${type}`),
};