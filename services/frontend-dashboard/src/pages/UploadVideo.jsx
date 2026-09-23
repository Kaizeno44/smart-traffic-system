import React, { useState, useEffect, useRef, useCallback } from 'react';
import { videoService } from '../services/videoService';

const UploadVideo = () => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState(null);
  const [pendingVideos, setPendingVideos] = useState([]);
  const [processedVideos, setProcessedVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // ============ FETCH LISTS ============
  const fetchVideos = useCallback(async () => {
    try {
      setLoading(true);
      const [pending, processed] = await Promise.all([
        videoService.getPendingVideos(),
        videoService.getProcessedVideos(),
      ]);
      setPendingVideos(pending.data.data || []);
      setProcessedVideos(processed.data.data || []);
    } catch (err) {
      console.error('Lỗi fetch videos:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos();
    // Auto refresh mỗi 10 giây (để thấy video mới xử lý xong)
    const interval = setInterval(fetchVideos, 10000);
    return () => clearInterval(interval);
  }, [fetchVideos]);

  // ============ UPLOAD ============
  const handleUpload = async (file) => {
    if (!file) return;

    // Validate
    const validExts = ['.mp4', '.avi', '.mov', '.mkv', '.webm'];
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!validExts.includes(ext)) {
      setMessage({ type: 'error', text: `Định dạng không hỗ trợ: ${ext}` });
      return;
    }

    const maxSize = 500 * 1024 * 1024;   // 500MB
    if (file.size > maxSize) {
      setMessage({ type: 'error', text: 'File quá lớn (>500MB)' });
      return;
    }

    try {
      setUploading(true);
      setProgress(0);
      setMessage(null);

      await videoService.uploadVideo(file, (p) => setProgress(p));

      setMessage({
        type: 'success',
        text: `✅ Upload thành công: ${file.name}`,
      });
      setProgress(100);

      // Refresh list
      setTimeout(() => {
        fetchVideos();
        setProgress(0);
      }, 1500);
    } catch (err) {
      console.error('Upload error:', err);
      setMessage({
        type: 'error',
        text: err.response?.data?.message || 'Lỗi upload. Vui lòng thử lại.',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ============ DRAG & DROP ============
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  // ============ DELETE ============
  const handleDelete = async (filename, type) => {
    if (!window.confirm(`Xóa video "${filename}"?`)) return;
    try {
      await videoService.deleteVideo(filename, type);
      fetchVideos();
    } catch (err) {
      alert('Lỗi xóa video');
    }
  };

  // ============ RENDER ============
  return (
    <div className="p-4 md:p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">📹 Upload Video</h2>
        <p className="text-sm text-gray-500 mt-1">
          Tải video lên để AI tự động phân tích và phát hiện vi phạm giao thông
        </p>
      </div>

      {/* Upload Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`border-3 border-dashed rounded-xl p-10 text-center transition cursor-pointer mb-6 ${
          isDragOver
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50'
        } ${uploading ? 'opacity-60 cursor-not-allowed' : ''}`}
        style={{ borderWidth: '3px' }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={(e) => handleUpload(e.target.files?.[0])}
          className="hidden"
          disabled={uploading}
        />

        {uploading ? (
          <div>
            <div className="text-5xl mb-4">📤</div>
            <p className="text-lg font-semibold text-blue-600 mb-4">
              Đang upload... {progress}%
            </p>
            <div className="w-full max-w-md mx-auto bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="text-5xl mb-4">📹</div>
            <p className="text-lg font-semibold text-gray-700 mb-2">
              Kéo thả video vào đây
            </p>
            <p className="text-sm text-gray-500 mb-4">
              hoặc click để chọn file
            </p>
            <p className="text-xs text-gray-400">
              Hỗ trợ: MP4, AVI, MOV, MKV, WEBM — Tối đa 500MB
            </p>
          </>
        )}
      </div>

      {/* Message */}
      {message && (
        <div
          className={`mb-6 p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 border-l-4 border-green-500 text-green-700'
              : 'bg-red-50 border-l-4 border-red-500 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending videos */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b bg-yellow-50">
            <h3 className="font-semibold text-gray-700">
              ⏳ Đang chờ xử lý ({pendingVideos.length})
            </h3>
          </div>
          <div className="p-4 max-h-96 overflow-y-auto">
            {loading ? (
              <p className="text-gray-400 text-center py-4">Đang tải...</p>
            ) : pendingVideos.length === 0 ? (
              <p className="text-gray-400 text-center py-4">
                Không có video nào đang chờ
              </p>
            ) : (
              <ul className="space-y-2">
                {pendingVideos.map((v) => (
                  <li
                    key={v.filename}
                    className="flex justify-between items-center p-3 bg-gray-50 rounded border hover:bg-gray-100"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 truncate text-sm">
                        {v.filename}
                      </p>
                      <p className="text-xs text-gray-500">{v.size_mb} MB</p>
                    </div>
                    <button
                      onClick={() => handleDelete(v.filename, 'pending')}
                      className="text-red-500 hover:text-red-700 ml-2 flex-shrink-0"
                      title="Xóa"
                    >
                      🗑️
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Processed videos */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b bg-green-50">
            <h3 className="font-semibold text-gray-700">
              ✅ Đã xử lý ({processedVideos.length})
            </h3>
          </div>
          <div className="p-4 max-h-96 overflow-y-auto">
            {loading ? (
              <p className="text-gray-400 text-center py-4">Đang tải...</p>
            ) : processedVideos.length === 0 ? (
              <p className="text-gray-400 text-center py-4">
                Chưa có video nào đã xử lý
              </p>
            ) : (
              <ul className="space-y-2">
                {processedVideos.map((v) => (
                  <li
                    key={v.filename}
                    className="flex justify-between items-center p-3 bg-gray-50 rounded border"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 truncate text-sm">
                        {v.filename}
                      </p>
                      <p className="text-xs text-gray-500">
                        {v.size_mb} MB • {new Date(v.processed_at).toLocaleString('vi-VN')}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(v.filename, 'processed')}
                      className="text-red-500 hover:text-red-700 ml-2 flex-shrink-0"
                      title="Xóa"
                    >
                      🗑️
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Refresh button */}
      <div className="mt-6 text-center">
        <button
          onClick={fetchVideos}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded text-gray-700 font-medium transition"
        >
          🔄 Làm mới danh sách
        </button>
      </div>
    </div>
  );
};

export default UploadVideo;