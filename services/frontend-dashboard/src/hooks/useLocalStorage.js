import { useState, useEffect } from 'react';

/**
 * Hook lưu/đọc state từ localStorage.
 * Tự động sync khi state thay đổi.
 */
export function useLocalStorage(key, initialValue) {
  // Khởi tạo state từ localStorage (nếu có)
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.warn(`Lỗi đọc localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Sync khi state thay đổi
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch (error) {
      console.warn(`Lỗi ghi localStorage key "${key}":`, error);
    }
  }, [key, storedValue]);

  return [storedValue, setStoredValue];
}