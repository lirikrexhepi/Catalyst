import React, { useState, useRef, useEffect, useCallback } from 'react';
import { LiquidGlass } from '../../liquid-glass';
import { AgentSessionFeed } from './AgentSessionFeed';
import { AgentInput } from './AgentInput';
import { AgentStreamBlock } from './types';

export type AgentSessionStatus = 'working' | 'finished' | 'idle' | 'error';

export interface AgentWindowProps {
  id?: string;
  title?: string;
  status?: AgentSessionStatus;
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
  minSize?: { width: number; height: number };
  maxSize?: { width: number; height: number };
  streamBlocks: AgentStreamBlock[];
  onSendMessage?: (msg: string, modelId: string) => void;
  onInterrupt?: () => void;
  onApprovePlan?: (blockId: string) => void;
  onAnswerQuestion?: (blockId: string, selectedKey: string, customText?: string) => void;
  onSkipQuestion?: (blockId: string) => void;
  onClose?: () => void;
  className?: string;
}

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

// Hoisted so the reference stays stable across renders and does not invalidate the
// memoized style chain inside LiquidGlass on every parent render.
const PANEL_STYLE: React.CSSProperties = {
  boxShadow:
    '0 24px 60px rgba(0, 0, 0, 0.55), 0 4px 16px rgba(0, 0, 0, 0.3), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.25)',
};

// `contain: paint` is intentionally absent: inside a backdrop-filtered panel it makes the
// scroller its own backdrop root, so every scroll frame re-resolves the panel's blur.
const FEED_SCROLL_STYLE: React.CSSProperties = {
  overscrollBehavior: 'contain',
  transform: 'translateZ(0)',
};

/**
 * AgentWindow Component
 * Full desktop-grade window with full 8-directional invisible perimeter resizing, draggable titlebar, and stateful status indicator.
 */
export const AgentWindow: React.FC<AgentWindowProps> = ({
  title = 'Task 2 name here',
  status = 'finished',
  initialPosition,
  initialSize = { width: 520, height: 660 },
  minSize = { width: 400, height: 420 },
  maxSize = { width: 1200, height: 1200 },
  streamBlocks,
  onSendMessage,
  onInterrupt,
  onApprovePlan,
  onAnswerQuestion,
  onSkipQuestion,
  onClose,
  className = '',
}) => {
  const [position, setPosition] = useState(() => {
    if (initialPosition) return initialPosition;
    const screenW = typeof window !== 'undefined' ? window.innerWidth : 1440;
    const screenH = typeof window !== 'undefined' ? window.innerHeight : 900;
    return {
      x: Math.max(20, Math.round((screenW - initialSize.width) / 2)),
      y: Math.max(80, Math.round((screenH - initialSize.height) / 2) + 20),
    };
  });

  const [size, setSize] = useState(initialSize);
  const [isDragging, setIsDragging] = useState(false);
  const [resizingDir, setResizingDir] = useState<ResizeDirection | null>(null);

  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, posX: 0, posY: 0, width: 0, height: 0 });
  const feedScrollRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  // Live geometry during a drag/resize gesture. Mouse moves write here and paint via
  // rAF-batched direct style writes, so the React tree is not re-rendered per frame.
  const liveGeomRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  // Origin the live transform is measured against, so the gesture can move the window
  // with a compositor-only translate instead of writing left/top each frame.
  const basePosRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  // Derive status from streamBlocks if not explicitly set
  const isWorking =
    status === 'working' ||
    streamBlocks.some(
      (b) =>
        (b.type === 'thinking' && b.isThinking) ||
        (b.type === 'tool_bash' && b.status === 'running') ||
        (b.type === 'tool_search' && b.isSearching)
    );

  // Auto-scroll to bottom when new stream blocks arrive
  useEffect(() => {
    if (feedScrollRef.current) {
      feedScrollRef.current.scrollTop = feedScrollRef.current.scrollHeight;
    }
  }, [streamBlocks.length]);

  // Window drag handler
  const handleTitleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;

    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      posX: position.x,
      posY: position.y,
      width: size.width,
      height: size.height,
    };
    liveGeomRef.current = {
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height,
    };
    basePosRef.current = { x: position.x, y: position.y };
    e.preventDefault();
  };

  // Window 8-directional resize handler
  const handleResizeMouseDown = (e: React.MouseEvent, dir: ResizeDirection) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    setResizingDir(dir);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      posX: position.x,
      posY: position.y,
      width: size.width,
      height: size.height,
    };
    liveGeomRef.current = {
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height,
    };
    basePosRef.current = { x: position.x, y: position.y };
  };

  // Paint the live gesture geometry straight to the DOM, batched to one write per frame.
  const paintLiveGeometry = useCallback(() => {
    rafRef.current = null;
    const el = windowRef.current;
    if (!el) return;
    const { x, y, width, height } = liveGeomRef.current;
    // Translating is composited; animating left/top would relayout every frame.
    el.style.transform = `translate3d(${x - basePosRef.current.x}px, ${
      y - basePosRef.current.y
    }px, 0)`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
  }, []);

  const schedulePaint = useCallback(() => {
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(paintLiveGeometry);
    }
  }, [paintLiveGeometry]);

  // Global mouse move & up listeners for drag / resize
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const screenW = window.innerWidth;
      const screenH = window.innerHeight;

      if (isDragging) {
        const deltaX = e.clientX - dragStartRef.current.mouseX;
        const deltaY = e.clientY - dragStartRef.current.mouseY;

        const newX = Math.min(
          Math.max(10, dragStartRef.current.posX + deltaX),
          screenW - dragStartRef.current.width - 10
        );
        const newY = Math.min(
          Math.max(10, dragStartRef.current.posY + deltaY),
          screenH - dragStartRef.current.height - 10
        );

        liveGeomRef.current = {
          x: newX,
          y: newY,
          width: dragStartRef.current.width,
          height: dragStartRef.current.height,
        };
        schedulePaint();
      } else if (resizingDir) {
        const deltaX = e.clientX - dragStartRef.current.mouseX;
        const deltaY = e.clientY - dragStartRef.current.mouseY;

        let newX = dragStartRef.current.posX;
        let newY = dragStartRef.current.posY;
        let newW = dragStartRef.current.width;
        let newH = dragStartRef.current.height;

        // Horizontal resizing
        if (resizingDir.includes('e')) {
          newW = Math.min(Math.max(minSize.width, dragStartRef.current.width + deltaX), maxSize.width);
        } else if (resizingDir.includes('w')) {
          const rawW = dragStartRef.current.width - deltaX;
          newW = Math.min(Math.max(minSize.width, rawW), maxSize.width);
          newX = dragStartRef.current.posX + (dragStartRef.current.width - newW);
        }

        // Vertical resizing
        if (resizingDir.includes('s')) {
          newH = Math.min(Math.max(minSize.height, dragStartRef.current.height + deltaY), maxSize.height);
        } else if (resizingDir.includes('n')) {
          const rawH = dragStartRef.current.height - deltaY;
          newH = Math.min(Math.max(minSize.height, rawH), maxSize.height);
          newY = dragStartRef.current.posY + (dragStartRef.current.height - newH);
        }

        liveGeomRef.current = { x: newX, y: newY, width: newW, height: newH };
        schedulePaint();
      }
    },
    [isDragging, resizingDir, minSize, maxSize, schedulePaint]
  );

  // Commit the final gesture geometry back into React state once, on release.
  const handleMouseUp = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // Hand the final geometry back to React as left/top and drop the live transform in
    // the same commit, so the window never jumps between the two representations.
    const el = windowRef.current;
    if (el) el.style.transform = '';
    const { x, y, width, height } = liveGeomRef.current;
    if (width > 0 && height > 0) {
      setPosition({ x, y });
      setSize({ width, height });
    }
    setIsDragging(false);
    setResizingDir(null);
  }, []);

  useEffect(() => {
    if (isDragging || resizingDir) {
      window.addEventListener('mousemove', handleMouseMove, { passive: true });
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, resizingDir, handleMouseMove, handleMouseUp]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  return (
    <div
      ref={windowRef}
      className={`absolute select-none pointer-events-auto ${className}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        zIndex: 25,
        willChange: isDragging || resizingDir ? 'transform' : undefined,
      }}
      data-gesture={isDragging || resizingDir ? 'active' : undefined}
    >
      <LiquidGlass
        variant="panel"
        surface="squircle"
        radius={18}
        bezelWidth={20}
        glassThickness={26}
        refractionScale={0.8}
        blur={0.6}
        specularOpacity={0.6}
        specularSaturation={6}
        lightAngle={-45}
        tint="rgba(30, 32, 38, 0.65)"
        shadow="apple"
        border="1px solid rgba(255, 255, 255, 0.16)"
        className="w-full h-full p-4.5 text-white shadow-2xl relative box-border"
        style={PANEL_STYLE}
      >
        {/* Full Height Flex Container */}
        <div className="flex flex-col h-full w-full min-h-0 overflow-hidden">
          {/* Fixed Header Row / Drag Handle */}
          <div
            onMouseDown={handleTitleMouseDown}
            className={`flex items-center justify-between shrink-0 pb-2.5 px-0.5 border-b border-white/10 ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
          >
            <div className="flex items-center gap-2 pointer-events-none">
              {/* Stateful Status Indicator: Yellow when working/thinking, Green when finished */}
              {isWorking ? (
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 shadow-[0_0_8px_rgba(251,191,36,0.7)] animate-pulse" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-lime-400 shrink-0 shadow-[0_0_8px_rgba(163,230,53,0.7)]" />
              )}

              <span className="text-[13px] font-medium font-['Geist'] text-white tracking-tight">
                {title}
              </span>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 flex items-center justify-center transition-all cursor-pointer text-white/60 hover:text-white pointer-events-auto"
            >
              <span className="material-symbols-outlined text-[13px] leading-none">
                close
              </span>
            </button>
          </div>

          {/* Dedicated Scrollable Feed */}
          <div
            ref={feedScrollRef}
            className="flex-1 min-h-0 h-0 overflow-y-auto overflow-x-hidden custom-scrollbar py-2.5 pr-2"
            style={FEED_SCROLL_STYLE}
          >
            <AgentSessionFeed
              blocks={streamBlocks}
              onApprovePlan={onApprovePlan}
              onAnswerQuestion={onAnswerQuestion}
              onSkipQuestion={onSkipQuestion}
            />
          </div>

          {/* Fixed Bottom Standalone AgentInput Component */}
          <div className="shrink-0 pt-2 border-t border-white/10">
            <AgentInput
              onSubmit={onSendMessage}
              onInterrupt={onInterrupt}
              isStreaming={isWorking}
              placeholder="Send a message"
            />
          </div>
        </div>
      </LiquidGlass>

      {/* Invisible Native 8-Directional Window Border & Corner Resize Perimeter */}
      {/* Top Edge */}
      <div
        onMouseDown={(e) => handleResizeMouseDown(e, 'n')}
        className="absolute -top-1.5 left-3 right-3 h-3 cursor-ns-resize z-40"
      />
      {/* Bottom Edge */}
      <div
        onMouseDown={(e) => handleResizeMouseDown(e, 's')}
        className="absolute -bottom-1.5 left-3 right-3 h-3 cursor-ns-resize z-40"
      />
      {/* Left Edge */}
      <div
        onMouseDown={(e) => handleResizeMouseDown(e, 'w')}
        className="absolute top-3 bottom-3 -left-1.5 w-3 cursor-ew-resize z-40"
      />
      {/* Right Edge */}
      <div
        onMouseDown={(e) => handleResizeMouseDown(e, 'e')}
        className="absolute top-3 bottom-3 -right-1.5 w-3 cursor-ew-resize z-40"
      />
      {/* Top-Left Corner */}
      <div
        onMouseDown={(e) => handleResizeMouseDown(e, 'nw')}
        className="absolute -top-1.5 -left-1.5 w-4 h-4 cursor-nwse-resize z-40"
      />
      {/* Top-Right Corner */}
      <div
        onMouseDown={(e) => handleResizeMouseDown(e, 'ne')}
        className="absolute -top-1.5 -right-1.5 w-4 h-4 cursor-nesw-resize z-40"
      />
      {/* Bottom-Left Corner */}
      <div
        onMouseDown={(e) => handleResizeMouseDown(e, 'sw')}
        className="absolute -bottom-1.5 -left-1.5 w-4 h-4 cursor-nesw-resize z-40"
      />
      {/* Bottom-Right Corner */}
      <div
        onMouseDown={(e) => handleResizeMouseDown(e, 'se')}
        className="absolute -bottom-1.5 -right-1.5 w-4 h-4 cursor-nwse-resize z-40"
      />
    </div>
  );
};

export default AgentWindow;
