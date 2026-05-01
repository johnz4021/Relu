import { Fragment } from 'react';

const STATUS_COLORS = {
  default: 'bg-gray-800 text-gray-400',
  updated: 'bg-green-900/50 text-green-400 ring-1 ring-green-500/50',
  highlight: 'bg-blue-900/50 text-blue-400 ring-1 ring-blue-500/50',
};

const STATUS_TEXT = {
  default: 'text-gray-400',
  updated: 'text-green-400',
  highlight: 'text-blue-400',
};

export default function KeyValuePanel({ data }) {
  const entries = data?.entries || [];

  if (data?.layout === 'table') {
    return (
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs font-mono">
        {entries.map((entry) => (
          <Fragment key={entry.key}>
            <span className="text-gray-500">{entry.key}</span>
            <span className={STATUS_TEXT[entry.status] || STATUS_TEXT.default}>
              {entry.value === Infinity || entry.value === 'Infinity' ? '\u221e' : entry.value}
            </span>
          </Fragment>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-2 flex-wrap">
      {entries.map((entry) => (
        <div
          key={entry.key}
          className={`rounded px-2 py-1 text-xs font-mono transition-all duration-300 ${STATUS_COLORS[entry.status] || STATUS_COLORS.default}`}
        >
          <span className="text-gray-500">{entry.key}:</span>{' '}
          <span>{entry.value === Infinity || entry.value === 'Infinity' ? '\u221e' : entry.value}</span>
        </div>
      ))}
    </div>
  );
}
