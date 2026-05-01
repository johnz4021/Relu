import KeyValuePanel from './KeyValuePanel';
import CollectionPanel from './CollectionPanel';
import ExpressionPanel from './ExpressionPanel';
import LogPanel from './LogPanel';
import PseudocodePanel from './PseudocodePanel';

export default function ContextPanel({ panel }) {
  const { type, title, data } = panel;

  const panelContent = (() => {
    switch (type) {
      case 'key_value':   return <KeyValuePanel data={data} />;
      case 'collection':  return <CollectionPanel data={data} />;
      case 'expression':  return <ExpressionPanel data={data} />;
      case 'log':         return <LogPanel data={data} />;
      case 'pseudocode':  return <PseudocodePanel data={data} />;
      default:            return <div className="text-gray-500 text-xs">Unknown panel type: {type}</div>;
    }
  })();

  return (
    <div className="border-b border-gray-800 px-4 py-3">
      <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">{title}</h3>
      {panelContent}
    </div>
  );
}
