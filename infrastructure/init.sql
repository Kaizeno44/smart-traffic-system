-- Bảng 1: Thông tin phương tiện (Vehicles)
CREATE TABLE Vehicles (
    id SERIAL PRIMARY KEY,
    license_plate VARCHAR(20) UNIQUE NOT NULL, -- Biển số xe
    vehicle_type VARCHAR(50)                   -- Loại phương tiện (VD: Motorbike, Car)
);

-- Bảng 2: Thông tin vi phạm (Violations)
CREATE TABLE Violations (
    id SERIAL PRIMARY KEY,
    vehicle_id INT REFERENCES Vehicles(id) ON DELETE CASCADE,
    violation_type VARCHAR(50) NOT NULL,       -- Loại vi phạm (VD: red_light, no_helmet)
    violation_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'Pending'       -- Trạng thái: Pending, Confirmed
);

-- Bảng 3: Bằng chứng hình ảnh (Evidences)
CREATE TABLE Evidences (
    id SERIAL PRIMARY KEY,
    violation_id INT REFERENCES Violations(id) ON DELETE CASCADE,
    panorama_image_path TEXT NOT NULL,         -- Đường dẫn lưu ảnh toàn cảnh
    license_plate_image_path TEXT              -- Đường dẫn lưu ảnh crop biển số
);