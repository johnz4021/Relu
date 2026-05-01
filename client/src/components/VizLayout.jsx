import { Component, lazy, Suspense } from 'react';

const GraphRenderer = lazy(() => import('./renderers/GraphRenderer'));
const ArrayRenderer = lazy(() => import('./renderers/ArrayRenderer'));
const TableRenderer = lazy(() => import('./renderers/TableRenderer'));
const TreeRenderer = lazy(() => import('./renderers/TreeRenderer'));
const LinkedRenderer = lazy(() => import('./renderers/LinkedRenderer'));
const IntervalRenderer = lazy(() => import('./renderers/IntervalRenderer'));
const RecursionTreeRenderer = lazy(() => import('./renderers/RecursionTreeRenderer'));
const StringRenderer = lazy(() => import('./renderers/StringRenderer'));

/**
 * Error boundary that catches renderer crashes and shows a fallback.
 */
class RendererErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[RendererErrorBoundary] ${this.props.rendererType} crashed:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
          <div className="text-red-400 text-sm font-medium">
            Renderer error
          </div>
          <p className="text-gray-500 text-xs text-center max-w-xs">
            The {this.props.rendererType} renderer encountered an error.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="text-xs text-blue-400 hover:text-blue-300 underline"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function RendererFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-gray-500 text-sm animate-pulse">Loading renderer...</div>
    </div>
  );
}

function RendererSwitch({ type, ...props }) {
  let Renderer;
  switch (type) {
    case 'graph':
      Renderer = GraphRenderer;
      break;
    case 'array':
      Renderer = ArrayRenderer;
      break;
    case 'table':
      Renderer = TableRenderer;
      break;
    case 'tree':
      Renderer = TreeRenderer;
      break;
    case 'linked':
      Renderer = LinkedRenderer;
      break;
    case 'interval':
      Renderer = IntervalRenderer;
      break;
    case 'recursion_tree':
      Renderer = RecursionTreeRenderer;
      break;
    case 'string':
      Renderer = StringRenderer;
      break;
    default:
      return (
        <div className="flex items-center justify-center h-full text-gray-500">
          Unknown renderer: {type}
        </div>
      );
  }

  return (
    <RendererErrorBoundary rendererType={type}>
      <Suspense fallback={<RendererFallback />}>
        <Renderer {...props} />
      </Suspense>
    </RendererErrorBoundary>
  );
}

/**
 * Manages which renderer panels are active and their layout.
 *
 * Props:
 *   panels: [{ id, renderer, props }] — which renderers to show
 *   explanationMode — passed through to active renderers
 *   segmentCount — passed through for snapshot tracking
 *   rewindStep — increments once per rewind_step_narration, triggers snapshot advance in renderers
 */
export default function VizLayout({ panels, explanationMode, segmentCount, rewindStep, algorithm, residualEdges, residualToggle, onElementClick }) {
  if (!panels || panels.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Waiting for visualization...
      </div>
    );
  }

  const layoutClass =
    panels.length === 1
      ? 'h-full'
      : panels.length === 2
        ? 'h-full grid grid-cols-2 gap-px bg-gray-800'
        : 'h-full grid grid-cols-2 grid-rows-2 gap-px bg-gray-800';

  return (
    <div className={layoutClass}>
      {panels.map((panel) => (
        <div key={panel.id} className="bg-gray-950 overflow-hidden h-full relative">
          {panels.length > 1 && panel.props?.title && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-2 py-0.5 text-xs font-medium text-text-secondary bg-surface-1 border border-border rounded">
              {typeof panel.props.title === 'string' ? panel.props.title : panel.props.title?.text || String(panel.props.title)}
            </div>
          )}
          <RendererSwitch
            type={panel.renderer}
            rendererId={panel.id}
            explanationMode={explanationMode}
            segmentCount={segmentCount}
            rewindStep={rewindStep}
            {...(panel.renderer === 'graph' ? { algorithm, residualEdges, residualToggle, onElementClick } : {})}
            {...panel.props}
          />
        </div>
      ))}
    </div>
  );
}
