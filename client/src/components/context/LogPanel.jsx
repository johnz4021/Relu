import { useEffect, useRef } from 'react';

const TYPE_COLORS = {
  info: 'text-gray-400',
  decision: 'text-blue-300',
  result: 'text-green-400',
};

export default function LogPanel({ data }) {
  const entries = data?.entries || [];
  const maxVisible = data?.max_visible || 8;
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [entries.length]);

  const visible = entries.slice(-maxVisible);

  return (
    <div
      ref={scrollRef}
      className="overflow-y-auto space-y-1"
      style={{ maxHeight: `${maxVisible * 1.75}rem` }}
    >
      {visible.map((entry, i) => (
        <div
          key={entries.length - maxVisible + i}
          className={`text-xs font-mono ${TYPE_COLORS[entry.type] || TYPE_COLORS.info}`}
        >
          {entry.type === 'decision' && <span className="text-blue-500 mr-1">\u25B6</span>}
          {entry.type === 'result' && <span className="text-green-500 mr-1">\u2713</span>}
          {entry.text}
        </div>
      ))}
      {entries.length === 0 && (
        <span className="text-gray-600 text-xs italic">No entries yet</span>
      )}
    </div>
  );
}
