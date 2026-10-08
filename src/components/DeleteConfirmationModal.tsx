import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, AlertTriangle } from 'lucide-react';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  isDeleting?: boolean;
}

const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  isDeleting = false,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-brand-dark/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="relative w-full max-w-md bg-brand-dark rounded-2xl shadow-2xl border border-white/10 overflow-hidden"
          >
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-brand-red/10 rounded-lg text-brand-red">
                  <AlertTriangle size={20} />
                </div>
                <h3 className="text-xl font-bold text-white">{title}</h3>
              </div>
              <button onClick={onClose} className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg">
                <X size={20} />
              </button>
            </div>
            <div className="p-6">
              <p className="text-white/60 leading-relaxed">
                {message}
              </p>
            </div>
            <div className="p-6 bg-white/5 border-t border-white/10 flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl font-bold text-white/60 hover:text-white hover:bg-white/10 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={isDeleting}
                className="px-6 py-2.5 bg-brand-red text-white rounded-xl font-bold hover:bg-red-600 transition-all shadow-lg shadow-brand-red/20 disabled:opacity-50 flex items-center gap-2"
              >
                {isDeleting ? (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : null}
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default DeleteConfirmationModal;
