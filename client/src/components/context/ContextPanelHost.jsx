import ContextPanel from './ContextPanel';

export default function ContextPanelHost({ panels, className }) {
  if (!panels || panels.length === 0) return null;

  return (
    <div className={className || ''}>
      {panels.map((panel) => (
        <ContextPanel key={panel.id} panel={panel} />
      ))}
    </div>
  );
}
