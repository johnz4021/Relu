import { useState, useRef, useCallback, useEffect } from 'react';

export function usePanZoom({ scaleMin = 0.2, scaleMax = 3 } = {}) {
  const containerRef = useRef(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const dragRef = useRef(null);

  const update = useCallback((t) => {
    transformRef.current = t;
    setTransform(t);
  }, []);

  // Wheel zoom toward cursor — must be non-passive to call preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const { x, y, k } = transformRef.current;
      const newK = Math.min(scaleMax, Math.max(scaleMin, k * factor));
      update({
        x: mx - (mx - x) * (newK / k),
        y: my - (my - y) * (newK / k),
        k: newK,
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [scaleMin, scaleMax, update]);

  const onPointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPanX: transformRef.current.x,
      startPanY: transformRef.current.y,
    };
  }, []);

  const onPointerMove = useCallback((e) => {
    if (!dragRef.current) return;
    update({
      ...transformRef.current,
      x: dragRef.current.startPanX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.startPanY + (e.clientY - dragRef.current.startY),
    });
  }, [update]);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const reset = useCallback(() => update({ x: 0, y: 0, k: 1 }), [update]);

  const hasMoved = transform.x !== 0 || transform.y !== 0 || transform.k !== 1;
  const transformStyle = `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`;

  return {
    containerRef,
    transformStyle,
    hasMoved,
    reset,
    handlers: { onPointerDown, onPointerMove, onPointerUp },
  };
}
