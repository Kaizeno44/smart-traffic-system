import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { videoService } from '../services/videoService';
import { SocketContext } from '../App';

// ============ MODAL PREVIEW ============
const VideoPreviewModal = ({ video, onClose }) => {
  if (!video) return null;
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
  const streamUrl = `${API_BASE}/videos/stream/${encodeURIComponent(video.filename)}?type=${video.type}`;

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-full max-w-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="font-bold text-gray-800 truncate">
            🎬 {video.filename}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="bg-black flex justify-center rounded-b-lg overflow-hidden">
          <video
            src={streamUrl}
            controls
            autoPlay
            className="w-full h-auto"
            style={{ maxHeight: '70vh' }}
          >
            Trình duyệt không hỗ trợ video.
          </video>
        </div>
      </div>
    </div>
  );
};


const UploadVideo = () => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState(null);
  const [pendingVideos, setPendingVideos] = useState([]);
  const [processedVideos, setProcessedVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);

  // Modal preview
  const [previewVideo, setPreviewVideo] = useState(null);

  // Filter + Sort
  const [filterText, setFilterText] = useState('');
  const [sortBy, setSortBy] = useState('date_desc');

  // Progress realtime
  const [progressMap, setProgressMap] = useState({});
  const [metadataMap, setMetadataMap] = useState({});
  const socket = useContext(SocketContext);

  const fileInputRef = useRef(null);

  // ============ FETCH LISTS (hỗ trợ silent) ============
  const fetchVideos = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [pending, processed] = await Promise.all([
        videoService.getPendingVideos(),
        videoService.getProcessedVideos(),
      ]);

      const processedList = processed.data.data || [];
      setPendingVideos(pending.data.data || []);
      setProcessedVideos(processedList);

      // Load metadata cho processed videos
      const metaPromises = processedList.map(async (v) => {
        try {
          const res = await videoService.getVideoMetadata(v.filename);
          return { filename: v.filename, metadata: res.data.data };
        } catch {
          return { filename: v.filename, metadata: null };
        }
      });
      const metaResults = await Promise.all(metaPromises);
      const metaObj = {};
      metaResults.forEach(({ filename, metadata }) => {
        if (metadata) metaObj[filename] = metadata;
      });
      setMetadataMap(metaObj);

    } catch (err) {
      console.error('Lỗi fetch videos:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // ============ INITIAL LOAD + POLLING ============
  useEffect(() => {
    fetchVideos();   // Lần đầu — có loading

    // Polling 15s (silent) — không chớp màn hình
    const interval = setInterval(() => fetchVideos(true), 15000);
    return () => clearInterval(interval);
  }, [fetchVideos]);

  // ============ SOCKET LISTENERS ============
  useEffect(() => {
    if (!socket) return;

    const handleProgress = (data) => {
      setProgressMap((prev) => ({
        ...prev,
        [data.filename]: data,
      }));

      // ✅ Khi progress >= 99% → video đã xử lý xong → refresh list
      if (data.percent >= 99) {
        setTimeout(() => {
          fetchVideos(true);
          // Xoá khỏi progressMap sau 2s
          setTimeout(() => {
            setProgressMap((prev) => {
              const newMap = { ...prev };
              delete newMap[data.filename];
              return newMap;
            });
          }, 2000);
        }, 1500);   // Đợi AI di chuyển file xong
      }
    };

    const handleNewViolation = () => {
      // Refresh sau 1 giây (silent)
      setTimeout(() => fetchVideos(true), 1000);
    };

    socket.on('video_progress', handleProgress);
    socket.on('new_violation', handleNewViolation);

    return () => {
      socket.off('video_progress', handleProgress);
      socket.off('new_violation', handleNewViolation);
    };
  }, [socket, fetchVideos]);


  // ============ UPLOAD ============
  const handleUpload = async (file) => {
    if (!file) return;

    // Validate định dạng
    const validExts = ['.mp4', '.avi', '.mov', '.mkv', '.webm'];
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!validExts.includes(ext)) {
      setMessage({ type: 'error', text: `Định dạng không hỗ trợ: ${ext}` });
      return;
    }

    // Validate kích thước
    const maxSize = 500 * 1024 * 1024;
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
        text: `✅ Upload thành công: ${file.name}. AI sẽ tự động xử lý...`,
      });
      setProgress(100);

      // Refresh list sau 1.5s
      setTimeout(() => {
        fetchVideos(true);
        setProgress(0);
      }, 1500);

      // Auto clear message sau 5s
      setTimeout(() => {
        setMessage(null);
      }, 5000);

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

  // ============ CANCEL ============
  const handleCancel = async (filename) => {
    if (!window.confirm(`Hủy xử lý video "${filename}"?`)) return;
    try {
      await videoService.cancelProcessing(filename);
      setMessage({ type: 'success', text: `⏹️ Đã gửi yêu cầu hủy: ${filename}` });
      setTimeout(() => setMessage(null), 3000);
      // Refresh sau 2s
      setTimeout(() => fetchVideos(true), 2000);
    } catch (err) {
      setMessage({
        type: 'error',
        text: 'Lỗi hủy: ' + (err.response?.data?.message || err.message),
      });
      setTimeout(() => setMessage(null), 5000);
    }
  };

  // ============ DELETE ============
  const handleDelete = async (filename, type) => {
    if (!window.confirm(`Xóa video "${filename}"?`)) return;
    try {
      await videoService.deleteVideo(filename, type);
      fetchVideos(true);
    } catch (err) {
      alert('Lỗi xóa video');
    }
  };

  // ============ FILTER + SORT ============
  const sortFn = useCallback((a, b) => {
    switch (sortBy) {
      case 'date_asc':
        return new Date(a.uploaded_at || a.processed_at) - new Date(b.uploaded_at || b.processed_at);
      case 'name_asc':
        return a.filename.localeCompare(b.filename);
      case 'size_desc':
        return parseFloat(b.size_mb) - parseFloat(a.size_mb);
      case 'date_desc':
      default:
        return new Date(b.uploaded_at || b.processed_at) - new Date(a.uploaded_at || a.processed_at);
    }
  }, [sortBy]);

  const filteredPending = pendingVideos
    .filter((v) => v.filename.toLowerCase().includes(filterText.toLowerCase()))
    .sort(sortFn);

  const filteredProcessed = processedVideos
    .filter((v) => v.filename.toLowerCase().includes(filterText.toLowerCase()))
    .sort(sortFn);


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

      {/* Filter Bar */}
      <div className="bg-white rounded-lg shadow p-4 mb-4 flex flex-col sm:flex-row gap-3 items-center">
        <div className="flex-1 w-full">
          <input
            type="text"
            placeholder="🔍 Tìm kiếm video..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="date_desc">📅 Mới nhất</option>
          <option value="date_asc">📅 Cũ nhất</option>
          <option value="name_asc">🔤 Tên A→Z</option>
          <option value="size_desc">📦 Dung lượng</option>
        </select>
        {filterText && (
          <button
            onClick={() => setFilterText('')}
            className="text-sm text-red-500 hover:text-red-700 font-medium"
          >
            ✕ Xóa lọc
          </button>
        )}
      </div>

      {/* 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending videos */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b bg-yellow-50">
            <h3 className="font-semibold text-gray-700">
              ⏳ Đang chờ xử lý ({filteredPending.length})
            </h3>
          </div>
          <div className="p-4 max-h-96 overflow-y-auto">
            {loading ? (
              <p className="text-gray-400 text-center py-4">Đang tải...</p>
            ) : filteredPending.length === 0 ? (
              <p className="text-gray-400 text-center py-4">
                Không có video nào đang chờ
              </p>
            ) : (
              <ul className="space-y-2">
                {filteredPending.map((v) => {
                  const prog = progressMap[v.filename];
                  const isProcessing = !!prog;

                  return (
                    <li
                      key={v.filename}
                      className="p-3 bg-gray-50 rounded border hover:bg-gray-100"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-800 truncate text-sm">
                            {isProcessing && '🎬 '}{v.filename}
                          </p>
                          <p className="text-xs text-gray-500">
                            {v.size_mb} MB
                            {isProcessing && ` • Frame ${prog.frame_current}/${prog.frame_total}`}
                            {isProcessing && prog.violations_count > 0 && ` • 🚨 ${prog.violations_count} vi phạm`}
                          </p>
                        </div>
                        <div className="flex gap-1 flex-shrink-0 ml-2">
                          {isProcessing ? (
                            <button
                              onClick={() => handleCancel(v.filename)}
                              className="text-orange-500 hover:text-orange-700"
                              title="Hủy xử lý"
                            >
                              ⏹️
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDelete(v.filename, 'pending')}
                              className="text-red-500 hover:text-red-700"
                              title="Xóa"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </div>

                      {isProcessing && (
                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${prog.percent}%` }}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Processed videos */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b bg-green-50">
            <h3 className="font-semibold text-gray-700">
              ✅ Đã xử lý ({filteredProcessed.length})
            </h3>
          </div>
          <div className="p-4 max-h-96 overflow-y-auto">
            {loading ? (
              <p className="text-gray-400 text-center py-4">Đang tải...</p>
            ) : filteredProcessed.length === 0 ? (
              <p className="text-gray-400 text-center py-4">
                Chưa có video nào đã xử lý
              </p>
            ) : (
              <ul className="space-y-2">
                {filteredProcessed.map((v) => {
                  const meta = metadataMap[v.filename];

                  return (
                    <li
                      key={v.filename}
                      className="flex justify-between items-start p-3 bg-gray-50 rounded border hover:bg-gray-100"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 truncate text-sm">
                          ✅ {v.filename}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {meta?.duration ? `⏱️ ${meta.duration}s • ` : ''}
                          {meta?.width ? `📹 ${meta.width}×${meta.height} • ` : ''}
                          {meta?.fps ? `${meta.fps} FPS • ` : ''}
                          {v.size_mb} MB
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(v.processed_at).toLocaleString('vi-VN')}
                        </p>
                      </div>

                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => setPreviewVideo({ filename: v.filename, type: 'processed' })}
                          className="text-blue-500 hover:text-blue-700"
                          title="Xem video"
                        >
                          ▶️
                        </button>
                        <button
                          onClick={() => handleDelete(v.filename, 'processed')}
                          className="text-red-500 hover:text-red-700"
                          title="Xóa"
                        >
                          🗑️
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {previewVideo && (
        <VideoPreviewModal
          video={previewVideo}
          onClose={() => setPreviewVideo(null)}
        />
      )}

      {/* Refresh button */}
      <div className="mt-6 text-center">
        <button
          onClick={() => fetchVideos()}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded text-gray-700 font-medium transition"
        >
          🔄 Làm mới danh sách
        </button>
      </div>
    </div>
  );
};

export default UploadVideo;