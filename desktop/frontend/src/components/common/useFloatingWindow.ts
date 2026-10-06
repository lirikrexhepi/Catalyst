import React, { useCallback, useEffect, useRef, useState } from 'react';

export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FloatingWindowOptions {
  initialPosition: { x: number; y: number };
  initialSize: { width: number; height: number };
  minSize?: { width: number; height: number };
  maxSize?: { width: number; height: number };
}

export interface FloatingWindow {
  position: { x: number; y: number };
  size: { width: number; height: number };
  /** Attach to the outermost element so live geometry can be painted onto it. */
  ref: React.RefObject<HTMLDivElement | null>;
  /** Attach to the title bar to make it a drag handle. */
  onTitleMouseDown: (event: React.MouseEvent) => void;
  /** Attach to each edge and corner affordance. */
  onResizeMouseDown: (event: React.MouseEvent, direction: ResizeDirection) => void;
  /** True while dragging or resizing, so content can be made inert. */
  isGesturing: boolean;
}

const DEFAULT_MIN = { width: 420, height: 380 };
const DEFAULT_MAX = { width: 2200, height: 1600 };
const EDGE_MARGIN = 10;

/**
 * Drag and resize behaviour for a floating window.
 *
 * Live geometry is painted straight to the DOM through a compositor transform
 * and only committed to React state on release, so a drag never re-renders the
 * window's contents — which for a large diff would turn a smooth gesture into a
 * slideshow. Extracted here so windows share one implementation rather than
 * each carrying a copy that drifts from the others.
 */
export function useFloatingWindow({
  initialPosition,
  initialSize,
  minSize = DEFAULT_MIN,
  maxSize = DEFAULT_MAX,
}: FloatingWindowOptions): FloatingWindow {
  const [position, setPosition] = useState(initialPosition);
  const [size, setSize] = useState(initialSize);
  const [isDragging, setIsDragging] = useState(false);
  const [resizingDir, setResizingDir] = useState<ResizeDirection | null>(null);

  const ref = useRef<HTMLDivElement>(null);
  const startRef = useRef({ mouseX: 0, mouseY: 0, posX: 0, posY: 0, width: 0, height: 0 });
  const liveRef = useRef<Geometry>({ x: 0, y: 0, width: 0, height: 0 });
  const baseRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  const beginGesture = useCallback(
    (event: React.MouseEvent) => {
      startRef.current = {
        mouseX: event.clientX,
        mouseY: event.clientY,
        posX: position.x,
        posY: position.y,
        width: size.width,
        height: size.height,
      };
      liveRef.current = { x: position.x, y: position.y, width: size.width, height: size.height };
      baseRef.current = { x: position.x, y: position.y };
    },
    [position.x, position.y, size.width, size.height],
  );

  const onTitleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      if (event.button !== 0) return;
      // Controls inside the title bar keep their own click behaviour.
      if ((event.target as HTMLElement).closest('button, input, select, textarea, a')) return;
      setIsDragging(true);
      beginGesture(event);
      event.preventDefault();
    },
    [beginGesture],
  );

  const onResizeMouseDown = useCallback(
    (event: React.MouseEvent, direction: ResizeDirection) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      event.preventDefault();
      setResizingDir(direction);
      beginGesture(event);
    },
    [beginGesture],
  );

  const paint = useCallback(() => {
    rafRef.current = null;
    const element = ref.current;
    if (!element) return;
    const { x, y, width, height } = liveRef.current;
    element.style.transform = `translate3d(${x - baseRef.current.x}px, ${y - baseRef.current.y}px, 0)`;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
  }, []);

  const schedulePaint = useCallback(() => {
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(paint);
  }, [paint]);

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      const start = startRef.current;
      const deltaX = event.clientX - start.mouseX;
      const deltaY = event.clientY - start.mouseY;

      if (isDragging) {
        liveRef.current = {
          x: Math.min(
            Math.max(EDGE_MARGIN, start.posX + deltaX),
            window.innerWidth - start.width - EDGE_MARGIN,
          ),
          y: Math.min(
            Math.max(EDGE_MARGIN, start.posY + deltaY),
            window.innerHeight - start.height - EDGE_MARGIN,
          ),
          width: start.width,
          height: start.height,
        };
        schedulePaint();
        return;
      }

      if (!resizingDir) return;

      let { posX: x, posY: y, width, height } = start;

      if (resizingDir.includes('e')) {
        width = clamp(start.width + deltaX, minSize.width, maxSize.width);
      } else if (resizingDir.includes('w')) {
        width = clamp(start.width - deltaX, minSize.width, maxSize.width);
        x = start.posX + (start.width - width);
      }

      if (resizingDir.includes('s')) {
        height = clamp(start.height + deltaY, minSize.height, maxSize.height);
      } else if (resizingDir.includes('n')) {
        height = clamp(start.height - deltaY, minSize.height, maxSize.height);
        y = start.posY + (start.height - height);
      }

      liveRef.current = { x, y, width, height };
      schedulePaint();
    },
    [isDragging, resizingDir, minSize, maxSize, schedulePaint],
  );

  const handleMouseUp = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const element = ref.current;
    if (element) element.style.transform = '';

    const { x, y, width, height } = liveRef.current;
    if (width > 0 && height > 0) {
      setPosition({ x, y });
      setSize({ width, height });
    }
    setIsDragging(false);
    setResizingDir(null);
  }, []);

  useEffect(() => {
    if (!isDragging && !resizingDir) return;
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, resizingDir, handleMouseMove, handleMouseUp]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  return {
    position,
    size,
    ref,
    onTitleMouseDown,
    onResizeMouseDown,
    isGesturing: isDragging || resizingDir !== null,
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
