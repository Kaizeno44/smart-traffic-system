import React, { useState } from 'react';
import ViolationTable from '../components/ViolationTable';
import ViolationDetailModal from '../components/ViolationDetailModal';

const Violations = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedViolation, setSelectedViolation] = useState(null);

  const handleViewDetail = (data) => {
    setSelectedViolation(data);
    setIsModalOpen(true);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Danh sách vi phạm</h2>
        {/* nút lọc tĩnh chuẩn bị cho tuần 5 */}
        <button className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700">
          Bộ lọc
        </button>
      </div>

      <ViolationTable onViewDetail={handleViewDetail} />
      
      <ViolationDetailModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        data={selectedViolation} 
      />
    </div>
  );
};

export default Violations;