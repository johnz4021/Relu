import { useState, useEffect, useRef, useCallback } from 'react';
import ContextPanelHost from './ContextPanelHost';

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 280;
const MIN_WIDTH = 240;
const MIN_HEIGHT = 160;
const MAX_WIDTH = 600;

export default function ContextOverlay({ panels, children }) {
  const [collapsed, setCollapsed] = useState(true);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const prevCount = useRef(0);
  const containerRef = useRef(null);

  // Auto-expand when panels go from 0 → N
  useEffect(() => {
    if (prevCount.current === 0 && panels.length > 0) {
      setCollapsed(false);
    }
    prevCount.current = panels.length;
  }, [panels.length]);

  // Reset size when collapsing
  const handleCollapse = useCallback(() => {
    setCollapsed(true);
    setWidth(DEFAULT_WIDTH);
    setHeight(DEFAULT_HEIGHT);
  }, []);

  const getMaxHeight = useCallback(() => {
    if (!containerRef.current) return 500;
    return containerRef.current.getBoundingClientRect().height * 0.6;
  }, []);

  const startResize = useCallback((mode) => (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = width;
    const startHeight = height;
    const maxH = getMaxHeight();

    const cursorMap = { right: 'col-resize', top: 'row-resize', corner: 'nwse-resize' };
    document.body.style.cursor = cursorMap[mode];
    document.body.style.userSelect = 'none';

    const onPointerMove = (ev) => {
      if (mode === 'right' || mode === 'corner') {
        const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + (ev.clientX - startX)));
        setWidth(newWidth);
      }
      if (mode === 'top' || mode === 'corner') {
        // Dragging top edge up increases height (card is bottom-anchored)
        const newHeight = Math.max(MIN_HEIGHT, Math.min(maxH, startHeight - (ev.clientY - startY)));
        setHeight(newHeight);
      }
    };

    const onPointerUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, [width, height, getMaxHeight]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {children}

      {panels.length > 0 && (
        collapsed ? (
          <button
            onClick={() => setCollapsed(false)}
            className="absolute bottom-3 left-3 z-20 px-3 py-1.5 bg-surface-1/95 backdrop-blur-sm border border-border rounded-full shadow-xl text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Context ({panels.length})
          </button>
        ) : (
          <div
            className="absolute bottom-3 left-3 z-20 bg-surface-1/95 backdrop-blur-sm border border-border rounded-lg shadow-xl flex flex-col"
            style={{ width, height }}
          >
            {/* Drag handles */}
            <div onPointerDown={startResize('right')} className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-accent/20 rounded-r-lg z-10" />
            <div onPointerDown={startResize('top')} className="absolute left-0 right-0 top-0 h-1.5 cursor-row-resize hover:bg-accent/20 rounded-t-lg z-10" />
            <div onPointerDown={startResize('corner')} className="absolute right-0 top-0 w-3 h-3 cursor-nwse-resize z-20" />

            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
              <span className="text-sm font-medium text-text-primary">Context</span>
              <button
                onClick={handleCollapse}
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            {/* Content */}
            <div className="overflow-y-auto flex-1 min-h-0">
              <ContextPanelHost panels={panels} />
            </div>
          </div>
        )
      )}
    </div>
  );
}
