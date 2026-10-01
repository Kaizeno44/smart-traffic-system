-- Migration: Thêm cột session_id vào bảng Violations
-- Mục đích: Gom nhóm vi phạm theo video upload (1 video = 1 session)
-- Ngày: 2026-10-01

ALTER TABLE Violations
  ADD COLUMN IF NOT EXISTS session_id VARCHAR(255) DEFAULT NULL;

-- Index để query nhanh theo session
CREATE INDEX IF NOT EXISTS idx_violations_session_id 
  ON Violations(session_id);

-- Verify
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'violations' 
  AND column_name = 'session_id';