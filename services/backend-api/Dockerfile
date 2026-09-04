FROM node:22-alpine
WORKDIR /app
# Copy file cấu hình và cài đặt thư viện
COPY package*.json ./
RUN npm install
# Copy toàn bộ mã nguồn
COPY . .
# Mở cổng 3000
EXPOSE 3000
# Lệnh khởi chạy server
CMD ["node", "src/app.js"]