-- Migration: Thêm cột mức phạt vào bảng Violations
-- Căn cứ: Nghị định 168/2024/NĐ-CP
-- Ngày: 2026-10-01

ALTER TABLE Violations
  ADD COLUMN IF NOT EXISTS fine_min INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fine_max INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fine_text VARCHAR(100) DEFAULT '',
  ADD COLUMN IF NOT EXISTS legal_basis VARCHAR(255) DEFAULT '';

-- Optional: Index để query theo mức phạt nếu cần
-- CREATE INDEX IF NOT EXISTS idx_violations_fine_min ON Violations(fine_min);

-- Verify
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'violations' 
  AND column_name IN ('fine_min', 'fine_max', 'fine_text', 'legal_basis');