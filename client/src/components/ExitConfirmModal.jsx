export default function ExitConfirmModal({ onConfirm, onCancel, mode }) {
  const isGuided = mode === 'guided';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface-1 border border-border rounded-xl shadow-xl max-w-sm w-full mx-4 p-6 font-body">
        <h3 className="text-base font-display font-semibold text-text-primary mb-2">
          {isGuided ? 'Leave this session?' : 'Leave this lesson?'}
        </h3>
        <p className="text-sm text-text-secondary mb-6">
          {isGuided
            ? 'Your conversation is saved and you can resume it later from the history tab.'
            : 'Your progress in this session will be lost. Are you sure you want to exit?'}
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-text-secondary bg-surface-2 hover:bg-surface-3 border border-border rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-surface-0 bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
          >
            {isGuided ? 'Exit Session' : 'Exit Lesson'}
          </button>
        </div>
      </div>
    </div>
  );
}
