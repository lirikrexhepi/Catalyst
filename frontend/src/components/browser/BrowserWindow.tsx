import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LiquidGlass } from '../../liquid-glass';
import { BrowserOpenURL } from '../../../wailsjs/runtime/runtime';
import { BrowserFrame } from './BrowserFrame';
import { BrowserState, displayUrl } from './useBrowser';

export interface BrowserWindowProps {
  browser: BrowserState;
  initialPosition: { x: number; y: number };
  initialSize: { width: number; height: number };
  isFocused?: boolean;
  onFocus?: () => void;
  onClose: () => void;
}

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const MIN_SIZE = { width: 420, height: 380 };
const MAX_SIZE = { width: 1600, height: 1400 };

const PANEL_STYLE: React.CSSProperties = {
  boxShadow:
    '0 24px 60px rgba(0, 0, 0, 0.55), 0 4px 16px rgba(0, 0, 0, 0.3), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.25)',
};

/**
 * A floating browser, tabbed by agent and then by page.
 *
 * Gesture handling mirrors AgentWindow: live geometry is painted straight to the
 * DOM through a compositor transform and only committed to React on release, so
 * dragging never re-renders the page inside.
 */
export const BrowserWindow: React.FC<BrowserWindowProps> = ({
  browser,
  initialPosition,
  initialSize,
  isFocused = false,
  onFocus,
  onClose,
}) => {
  const [position, setPosition] = useState(initialPosition);
  const [size, setSize] = useState(initialSize);
  const [isDragging, setIsDragging] = useState(false);
  const [resizingDir, setResizingDir] = useState<ResizeDirection | null>(null);
  const [draft, setDraft] = useState('');

  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, posX: 0, posY: 0, width: 0, height: 0 });
  const windowRef = useRef<HTMLDivElement>(null);
  const liveGeomRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const basePosRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  const { activeAgent, activeTab } = browser;

  // The address bar tracks the active tab except while it is being edited, so
  // switching tabs or auto-opening a discovered port updates what is shown.
  useEffect(() => {
    setDraft(displayUrl(activeTab?.url ?? ''));
  }, [activeTab?.id, activeTab?.url]);

  const beginGesture = (e: React.MouseEvent) => {
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      posX: position.x,
      posY: position.y,
      width: size.width,
      height: size.height,
    };
    liveGeomRef.current = { x: position.x, y: position.y, width: size.width, height: size.height };
    basePosRef.current = { x: position.x, y: position.y };
  };

  const handleTitleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, input')) return;
    setIsDragging(true);
    beginGesture(e);
    e.preventDefault();
  };

  const handleResizeMouseDown = (e: React.MouseEvent, dir: ResizeDirection) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setResizingDir(dir);
    beginGesture(e);
  };

  const paintLiveGeometry = useCallback(() => {
    rafRef.current = null;
    const el = windowRef.current;
    if (!el) return;
    const { x, y, width, height } = liveGeomRef.current;
    el.style.transform = `translate3d(${x - basePosRef.current.x}px, ${
      y - basePosRef.current.y
    }px, 0)`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
  }, []);

  const schedulePaint = useCallback(() => {
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(paintLiveGeometry);
  }, [paintLiveGeometry]);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const screenW = window.innerWidth;
      const screenH = window.innerHeight;

      if (isDragging) {
        const deltaX = e.clientX - dragStartRef.current.mouseX;
        const deltaY = e.clientY - dragStartRef.current.mouseY;
        liveGeomRef.current = {
          x: Math.min(
            Math.max(10, dragStartRef.current.posX + deltaX),
            screenW - dragStartRef.current.width - 10,
          ),
          y: Math.min(
            Math.max(10, dragStartRef.current.posY + deltaY),
            screenH - dragStartRef.current.height - 10,
          ),
          width: dragStartRef.current.width,
          height: dragStartRef.current.height,
        };
        schedulePaint();
        return;
      }

      if (!resizingDir) return;
      const deltaX = e.clientX - dragStartRef.current.mouseX;
      const deltaY = e.clientY - dragStartRef.current.mouseY;

      let newX = dragStartRef.current.posX;
      let newY = dragStartRef.current.posY;
      let newW = dragStartRef.current.width;
      let newH = dragStartRef.current.height;

      if (resizingDir.includes('e')) {
        newW = Math.min(Math.max(MIN_SIZE.width, dragStartRef.current.width + deltaX), MAX_SIZE.width);
      } else if (resizingDir.includes('w')) {
        newW = Math.min(
          Math.max(MIN_SIZE.width, dragStartRef.current.width - deltaX),
          MAX_SIZE.width,
        );
        newX = dragStartRef.current.posX + (dragStartRef.current.width - newW);
      }

      if (resizingDir.includes('s')) {
        newH = Math.min(
          Math.max(MIN_SIZE.height, dragStartRef.current.height + deltaY),
          MAX_SIZE.height,
        );
      } else if (resizingDir.includes('n')) {
        newH = Math.min(
          Math.max(MIN_SIZE.height, dragStartRef.current.height - deltaY),
          MAX_SIZE.height,
        );
        newY = dragStartRef.current.posY + (dragStartRef.current.height - newH);
      }

      liveGeomRef.current = { x: newX, y: newY, width: newW, height: newH };
      schedulePaint();
    },
    [isDragging, resizingDir, schedulePaint],
  );

  const handleMouseUp = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
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

  const submitAddress = (e: React.FormEvent) => {
    e.preventDefault();
    browser.navigate(draft);
  };

  // A pointer gesture inside the page steals mousemove from the window, so the
  // frame is made inert for the duration of a drag or resize.
  const isGesturing = isDragging || resizingDir !== null;

  return (
    <div
      ref={windowRef}
      onMouseDown={onFocus}
      className="absolute select-none pointer-events-auto"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        zIndex: isGesturing ? 38 : isFocused ? 36 : 26,
        willChange: isGesturing ? 'transform' : undefined,
      }}
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
        className="w-full h-full p-3 text-white shadow-2xl relative box-border"
        style={PANEL_STYLE}
      >
        <div className="flex flex-col h-full w-full min-h-0 gap-2">
          {/* Agent lane: which spawned agent's world we are looking at. */}
          <div
            onMouseDown={handleTitleMouseDown}
            className={`flex items-center gap-2 shrink-0 ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
          >
            <span className="material-symbols-rounded text-[16px] text-white/50 leading-none shrink-0 pl-0.5">
              globe
            </span>

            <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-scrollbar">
              {browser.agents.length === 0 ? (
                <span className="text-[12px] font-medium font-['Geist'] text-white/45 tracking-tight truncate">
                  Browser
                </span>
              ) : (
                browser.agents.map((agent) => {
                  const isActive = agent.threadId === browser.activeAgentId;
                  return (
                    <button
                      key={agent.threadId}
                      type="button"
                      title={agent.title}
                      onClick={() => browser.selectAgent(agent.threadId)}
                      className={`h-[24px] pl-1.5 pr-2.5 rounded-[8px] flex items-center gap-1.5 text-[11.5px] font-medium font-['Geist'] tracking-tight transition-all duration-150 cursor-pointer shrink-0 max-w-[180px] ${
                        isActive
                          ? 'bg-white/18 ring-1 ring-inset ring-white/20 text-white'
                          : 'text-white/50 hover:text-white/85 hover:bg-white/8'
                      }`}
                    >
                      {/* An agent lane is marked so it reads as a live session rather
                          than a page someone opened by hand. One colour throughout:
                          working breathes, idle sits dim, and nothing competes for
                          attention through hue. */}
                      {agent.isAgent ? (
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            agent.isBusy
                              ? 'bg-white shadow-[0_0_6px_rgba(255,255,255,0.5)] status-dot-working'
                              : agent.ports.length
                                ? 'bg-white/70'
                                : 'bg-white/25'
                          }`}
                        />
                      ) : (
                        <span className="material-symbols-rounded text-[13px] leading-none text-white/40 shrink-0">
                          language
                        </span>
                      )}
                      <span className="truncate">{agent.title}</span>
                    </button>
                  );
                })
              )}
            </div>

            <button
              type="button"
              title="Close"
              onClick={onClose}
              className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 flex items-center justify-center transition-all cursor-pointer text-white/60 hover:text-white shrink-0"
            >
              <span className="material-symbols-outlined text-[13px] leading-none">close</span>
            </button>
          </div>

          {/* Page tabs for the selected agent. */}
          {activeAgent && (
            <div className="flex items-center gap-1 shrink-0 overflow-x-auto no-scrollbar">
              {activeAgent.tabs.map((tab) => {
                const isActive = tab.id === activeAgent.activeTabId;
                return (
                  <div
                    key={tab.id}
                    onClick={() => browser.selectTab(tab.id)}
                    className={`group h-[23px] pl-2.5 pr-1 rounded-[7px] flex items-center gap-1 cursor-pointer transition-all duration-150 shrink-0 max-w-[150px] ${
                      isActive
                        ? 'bg-white/12 text-white/90'
                        : 'text-white/40 hover:text-white/70 hover:bg-white/6'
                    }`}
                  >
                    <span className="text-[11px] font-['Geist'] tracking-tight truncate">
                      {displayUrl(tab.url).replace(/^https?:\/\//, '') || 'New tab'}
                    </span>
                    <button
                      type="button"
                      title="Close tab"
                      onClick={(e) => {
                        e.stopPropagation();
                        browser.closeTab(tab.id);
                      }}
                      className="w-[15px] h-[15px] rounded-[4px] grid place-items-center opacity-0 group-hover:opacity-100 hover:bg-white/20 transition-all shrink-0 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[11px] leading-none">
                        close
                      </span>
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                title="New tab"
                onClick={() => browser.openTab()}
                className="w-[22px] h-[22px] rounded-[6px] grid place-items-center text-white/40 hover:text-white/85 hover:bg-white/10 active:scale-90 transition-all cursor-pointer shrink-0"
              >
                <span className="material-symbols-rounded text-[15px] leading-none">add</span>
              </button>
            </div>
          )}

          {/* Address bar, plus one-click chips for ports this agent is serving. */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              title="Reload"
              onClick={browser.reload}
              className="w-[26px] h-[26px] rounded-[8px] grid place-items-center text-white/45 hover:text-white/90 hover:bg-white/10 active:scale-90 transition-all cursor-pointer shrink-0"
            >
              <span className="material-symbols-rounded text-[16px] leading-none">refresh</span>
            </button>

            <form onSubmit={submitAddress} className="flex-1 min-w-0">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                spellCheck={false}
                placeholder="localhost:3000"
                className="w-full h-[26px] px-2.5 rounded-[8px] bg-white/[0.07] border border-white/[0.1] focus:border-white/25 focus:bg-white/[0.1] outline-none text-[11.5px] font-['Geist'] text-white/90 placeholder:text-white/30 transition-all duration-150"
              />
            </form>

            <button
              type="button"
              title="Open in system browser"
              disabled={!activeTab?.url || activeTab.url === 'about:blank'}
              onClick={() => activeTab && BrowserOpenURL(activeTab.url)}
              className="w-[26px] h-[26px] rounded-[8px] grid place-items-center text-white/45 hover:text-white/90 hover:bg-white/10 active:scale-90 transition-all cursor-pointer shrink-0 disabled:opacity-30 disabled:cursor-default"
            >
              <span className="material-symbols-rounded text-[15px] leading-none">open_in_new</span>
            </button>
          </div>

          {browser.error && (
            <div className="px-2.5 py-1.5 rounded-[8px] bg-red-500/10 border border-red-400/25 shrink-0">
              <span className="text-[10.5px] font-medium font-['Geist'] text-red-200/90">
                {browser.error}
              </span>
            </div>
          )}

          {/* Pointer events are dropped mid-gesture so the page cannot swallow the drag. */}
          <div className={`flex-1 min-h-0 flex ${isGesturing ? 'pointer-events-none' : ''}`}>
            {activeTab ? (
              <BrowserFrame tab={activeTab} onBlocked={browser.markBlocked} />
            ) : (
              <div className="flex-1 min-h-0 rounded-[12px] bg-white/[0.03] border border-white/[0.07] grid place-items-center">
                <div className="flex flex-col items-center gap-2 px-6 text-center max-w-[280px]">
                  <span className="material-symbols-rounded text-[26px] text-white/25 leading-none">
                    globe
                  </span>
                  <span className="text-[12px] font-['Geist'] text-white/40 leading-relaxed">
                    No agent is serving a page yet. Once an agent starts a dev server it appears
                    here automatically.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </LiquidGlass>

      <div
        onMouseDown={(e) => handleResizeMouseDown(e, 'n')}
        className="absolute -top-1.5 left-3 right-3 h-3 cursor-ns-resize z-40"
      />
      <div
        onMouseDown={(e) => handleResizeMouseDown(e, 's')}
        className="absolute -bottom-1.5 left-3 right-3 h-3 cursor-ns-resize z-40"
      />
      <div
        onMouseDown={(e) => handleResizeMouseDown(e, 'w')}
        className="absolute top-3 bottom-3 -left-1.5 w-3 cursor-ew-resize z-40"
      />
      <div
        onMouseDown={(e) => handleResizeMouseDown(e, 'e')}
        className="absolute top-3 bottom-3 -right-1.5 w-3 cursor-ew-resize z-40"
      />
      <div
        onMouseDown={(e) => handleResizeMouseDown(e, 'nw')}
        className="absolute -top-1.5 -left-1.5 w-4 h-4 cursor-nwse-resize z-40"
      />
      <div
        onMouseDown={(e) => handleResizeMouseDown(e, 'ne')}
        className="absolute -top-1.5 -right-1.5 w-4 h-4 cursor-nesw-resize z-40"
      />
      <div
        onMouseDown={(e) => handleResizeMouseDown(e, 'sw')}
        className="absolute -bottom-1.5 -left-1.5 w-4 h-4 cursor-nesw-resize z-40"
      />
      <div
        onMouseDown={(e) => handleResizeMouseDown(e, 'se')}
        className="absolute -bottom-1.5 -right-1.5 w-4 h-4 cursor-nwse-resize z-40"
      />
    </div>
  );
};

export default BrowserWindow;
