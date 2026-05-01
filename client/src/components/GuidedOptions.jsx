import { useState } from 'react';
import MathText from './MathText';

export default function GuidedOptions({ options, prompt, mode, inputPlaceholder, multiSelect, onSelect, disabled }) {
  const [text, setText] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());

  const handleSubmitText = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSelect({ text: text.trim() });
    setText('');
  };

  const handleToggle = (option) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(option.id)) {
        next.delete(option.id);
      } else {
        next.add(option.id);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    if (selectedIds.size === 0) return;
    const selected = (options || []).filter((o) => selectedIds.has(o.id));
    onSelect({
      optionIds: selected.map((o) => o.id),
      labels: selected.map((o) => o.label),
    });
    setSelectedIds(new Set());
  };

  return (
    <div className="space-y-2 font-body">
      {prompt && (
        <p className="text-sm text-text-secondary"><MathText>{prompt}</MathText></p>
      )}
      {mode === 'open_ended' ? (
        <form onSubmit={handleSubmitText} className="flex gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={disabled}
            placeholder={disabled ? 'Waiting for tutor...' : (inputPlaceholder || 'Type your answer...')}
            className={`flex-1 bg-surface-2 border border-accent/50 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            autoFocus
          />
          <button
            type="submit"
            disabled={disabled}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${disabled ? 'bg-surface-3 text-text-tertiary cursor-not-allowed' : 'bg-accent hover:bg-accent-hover text-surface-0'}`}
          >
            Submit
          </button>
        </form>
      ) : multiSelect ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {(options || []).map((option) => (
              <button
                key={option.id}
                onClick={() => handleToggle(option)}
                disabled={disabled}
                className={`border px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  disabled
                    ? 'border-border text-text-tertiary cursor-not-allowed opacity-50'
                    : selectedIds.has(option.id)
                      ? 'border-accent bg-accent-muted text-accent'
                      : 'border-accent/50 text-accent hover:bg-accent-muted'
                }`}
              >
                <MathText>{option.label}</MathText>
              </button>
            ))}
          </div>
          <button
            onClick={handleConfirm}
            disabled={disabled || selectedIds.size === 0}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              !disabled && selectedIds.size > 0
                ? 'bg-accent hover:bg-accent-hover text-surface-0'
                : 'bg-surface-3 text-text-tertiary cursor-not-allowed'
            }`}
          >
            Confirm ({selectedIds.size} selected)
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {(options || []).map((option) => (
            <button
              key={option.id}
              onClick={() => onSelect({ optionId: option.id, label: option.label })}
              disabled={disabled}
              className={`border px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                disabled
                  ? 'border-border text-text-tertiary cursor-not-allowed opacity-50'
                  : 'border-accent/50 text-accent hover:bg-accent-muted'
              }`}
            >
              <MathText>{option.label}</MathText>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
