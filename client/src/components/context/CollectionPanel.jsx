const STATUS_COLORS = {
  default: 'bg-gray-800 border-gray-700',
  active: 'bg-blue-900/50 border-blue-500',
  removed: 'bg-red-900/30 border-red-500 opacity-50',
  added: 'bg-green-900/50 border-green-500',
};

const STYLE_LABELS = {
  queue: 'front \u2192',
  stack: 'top \u2193',
  set: null,
  list: null,
};

export default function CollectionPanel({ data }) {
  const items = data?.items || [];
  const style = data?.style || 'list';
  const label = STYLE_LABELS[style];
  const isVertical = style === 'stack';

  return (
    <div>
      {label && (
        <span className="text-[10px] text-gray-500 uppercase tracking-wide mb-1 block">{label}</span>
      )}
      <div className={`flex ${isVertical ? 'flex-col' : 'flex-row flex-wrap'} gap-1.5`}>
        {items.map((item, i) => (
          <div
            key={i}
            className={`rounded border px-2 py-1 text-xs font-mono transition-all duration-300 ${STATUS_COLORS[item.status] || STATUS_COLORS.default}`}
          >
            {item.label && (
              <span className="text-gray-500 mr-1">{item.label}:</span>
            )}
            <span className="text-gray-200">{item.value}</span>
          </div>
        ))}
        {items.length === 0 && (
          <span className="text-gray-600 text-xs italic">empty</span>
        )}
      </div>
    </div>
  );
}
