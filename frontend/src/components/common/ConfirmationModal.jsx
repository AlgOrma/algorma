import React from 'react';
import Button from './Button';

export default function ConfirmationModal({
  isOpen,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  confirmVariant = 'red'
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-bg-overlay/80 backdrop-blur-[4px] flex items-center justify-center z-[2000] p-5 animate-fade-in">
      <div className="w-full max-w-[400px] bg-bg-main border border-border-main rounded-md shadow-modal flex flex-col text-left overflow-hidden animate-scale-up">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between">
          <span className="text-fs-15 font-semibold text-text-main font-mono tracking-wider">
            {title.toUpperCase()}
          </span>
          <button
            onClick={onCancel}
            className="bg-transparent border-none text-text-muted text-fs-16 cursor-pointer leading-none hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="px-6 py-5 text-fs-13 text-text-muted leading-relaxed">
          {message}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-[#080808] border-t border-border-subtle flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel} size="sm">
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} size="sm">
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
