export default function PseudocodePanel({ data }) {
  const lines = data?.lines || [];
  const currentLine = data?.current_line;
  const highlightLines = new Set(data?.highlight_lines || []);

  return (
    <div className="font-mono text-xs space-y-0 bg-gray-800/30 rounded px-2 py-1 overflow-x-auto">
      {lines.map((line, i) => {
        const isCurrent = currentLine === i;
        const isHighlight = highlightLines.has(i);
        const text = typeof line === 'object' ? line.text : line;
        const indent = typeof line === 'object' ? (line.indent || 0) : 0;
        return (
          <div
            key={i}
            className={`px-2 py-0.5 rounded-sm whitespace-pre transition-colors duration-200 ${
              isCurrent
                ? 'bg-blue-600/40 text-blue-100'
                : isHighlight
                  ? 'bg-yellow-500/20 text-yellow-200'
                  : 'text-gray-400'
            }`}
            style={indent ? { paddingLeft: `${indent * 12 + 8}px` } : undefined}
          >
            <span className="text-gray-600 select-none mr-2 inline-block w-4 text-right">{i + 1}</span>
            {text}
          </div>
        );
      })}
    </div>
  );
}
