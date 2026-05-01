import MathText from '../MathText';

export default function ExpressionPanel({ data }) {
  const { expression, result, highlight_terms, lines, label } = data || {};

  // Multi-line mode: structured formulation display
  if (lines?.length) {
    return (
      <div className="font-mono text-sm text-gray-200 bg-gray-800/50 rounded px-3 py-2 space-y-1">
        {label && <div className="text-xs text-gray-400 mb-1"><MathText>{label}</MathText></div>}
        {lines.map((line, i) => (
          <div key={i} className={line.highlight ? 'text-blue-300 bg-blue-500/20 rounded px-1' : ''}>
            {line.label && <span className="text-gray-500 mr-2"><MathText>{line.label}</MathText>:</span>}
            <MathText>{line.text}</MathText>
          </div>
        ))}
      </div>
    );
  }

  // Existing single-expression mode
  if (!expression) return null;

  // Build highlighted expression
  let rendered = expression;
  if (highlight_terms?.length) {
    const parts = [];
    let remaining = expression;
    for (const term of highlight_terms) {
      const idx = remaining.indexOf(term);
      if (idx === -1) continue;
      if (idx > 0) parts.push({ text: remaining.slice(0, idx), highlight: false });
      parts.push({ text: term, highlight: true });
      remaining = remaining.slice(idx + term.length);
    }
    if (remaining) parts.push({ text: remaining, highlight: false });

    if (parts.length > 0) {
      rendered = (
        <span>
          {parts.map((p, i) =>
            p.highlight ? (
              <span key={i} className="bg-blue-500/30 text-blue-300 rounded px-0.5"><MathText>{p.text}</MathText></span>
            ) : (
              <MathText key={i}>{p.text}</MathText>
            )
          )}
        </span>
      );
    }
  }

  return (
    <div className="font-mono text-sm text-gray-200 bg-gray-800/50 rounded px-3 py-2">
      <div>{typeof rendered === 'string' ? <MathText>{rendered}</MathText> : rendered}</div>
      {result !== undefined && result !== null && (
        <div className="text-green-400 mt-1">= {result}</div>
      )}
    </div>
  );
}
