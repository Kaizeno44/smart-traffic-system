import axios from 'axios';

// Thay 'http://localhost:5000/api' bằng port thực tế mà Dev 2 đang chạy Backend
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor để tự động xử lý/log lỗi nếu API trả về lỗi
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('Lỗi gọi API:', error);
    return Promise.reject(error);
  }
);

export default api;