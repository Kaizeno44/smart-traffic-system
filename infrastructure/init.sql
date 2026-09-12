-- Bảng 1: Thông tin phương tiện (Vehicles)
CREATE TABLE Vehicles (
    id SERIAL PRIMARY KEY,
    license_plate VARCHAR(20) UNIQUE NOT NULL, -- Biển số xe
    vehicle_type VARCHAR(50)                   -- Loại phương tiện (VD: motorbike, car)
);

-- Bảng 2: Thông tin vi phạm (Violations)
CREATE TABLE Violations (
    id SERIAL PRIMARY KEY,
    vehicle_id INT REFERENCES Vehicles(id) ON DELETE CASCADE,
    violation_type VARCHAR(50) NOT NULL,       -- Loại vi phạm (VD: red_light, no_helmet)
    violation_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'Pending',      -- Trạng thái: Pending, Confirmed
    extra_info JSONB                           -- BỔ SUNG: Dùng để lưu linh hoạt các dữ liệu từ AI như {"light_status": "red", "confidence": 0.98}
);

-- Bảng 3: Bằng chứng hình ảnh (Evidences)
CREATE TABLE Evidences (
    id SERIAL PRIMARY KEY,
    violation_id INT REFERENCES Violations(id) ON DELETE CASCADE,
    panorama_image_path TEXT NOT NULL,         -- Đường dẫn lưu ảnh toàn cảnh
    license_plate_image_path TEXT,             -- Đường dẫn lưu ảnh crop biển số
    video_path VARCHAR(255)              
);

-- BỔ SUNG: Tối ưu hóa hiệu năng (Indexes)
-- Giúp API Backend truy xuất dữ liệu cực nhanh khi FE gọi bộ lọc tìm kiếm
CREATE INDEX idx_vehicles_license_plate ON Vehicles(license_plate);
CREATE INDEX idx_violations_violation_time ON Violations(violation_time);
CREATE INDEX idx_violations_status ON Violations(status);