import { useEffect } from 'react';

interface BulkAddModalProps {
  open: boolean;
  onClose: () => void;
}

export const BulkAddModal = ({ open, onClose }: BulkAddModalProps) => {
  if (!open) return null;

  const handleClose = () => {
    onClose();
  };

  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      if (!open) return;

      switch (e.key) {
        case 'Escape':
          handleClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyboard);
    return () => document.removeEventListener('keydown', handleKeyboard);
  }, [open]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
        <div className="p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Bulk Add Nodes</h2>

          <div className="p-3 bg-gray-50 text-gray-700 rounded-md">
            Temporarily disabled. Use <code>1k</code>, <code>10k</code>, or <code>100k</code> seeds instead.
          </div>
        </div>

        <div className="px-6 py-3 bg-gray-50 flex justify-end gap-3 rounded-b-lg">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md flex items-center gap-2"
          >
            Close
            <span className="px-1.5 py-0.5 text-xs bg-blue-500 rounded">ESC</span>
          </button>
        </div>
      </div>
    </div>
  );
}
