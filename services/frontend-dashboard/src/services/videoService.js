import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const VIDEO_API = `${API_BASE}/videos`;

export const videoService = {
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
      timeout: 300000,
    });
  },

  getPendingVideos: () => axios.get(`${VIDEO_API}/pending`),
  getProcessedVideos: () => axios.get(`${VIDEO_API}/processed`),

  deleteVideo: (filename, type = 'pending') =>
    axios.delete(`${VIDEO_API}/${encodeURIComponent(filename)}?type=${type}`),

  getVideoMetadata: (filename) =>
    axios.get(`${VIDEO_API}/metadata/${encodeURIComponent(filename)}`),

  cancelProcessing: (filename) =>
    axios.post(`${VIDEO_API}/cancel/${encodeURIComponent(filename)}`),

  getStreamUrl: (filename, type = 'processed') =>
    `${VIDEO_API}/stream/${encodeURIComponent(filename)}?type=${type}`,
};