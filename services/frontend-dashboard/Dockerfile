# Sử dụng Node.js
FROM node:22-alpine

# Đặt thư mục làm việc trong container
WORKDIR /app

# Copy các file cấu hình và cài đặt thư viện
COPY package*.json ./
RUN npm install

# Copy toàn bộ mã nguồn Frontend
COPY . .

# Mở cổng 5173 (Port mặc định của Vite)
EXPOSE 5173

# Lệnh khởi chạy ứng dụng (bắt buộc phải có --host để Vite phát sóng ra ngoài Docker)
CMD ["npm", "run", "dev", "--", "--host"]