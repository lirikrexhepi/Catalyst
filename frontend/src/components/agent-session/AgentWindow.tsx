import React, { useRef, useEffect, useState } from 'react';
import { LiquidGlass } from '../../liquid-glass';
import { useTheme } from '../../themes';
import { AgentSessionFeed } from './AgentSessionFeed';
import { AgentBrowserView } from './AgentBrowserView';
import { AgentGitView } from './AgentGitView';
import { AgentServersView } from './AgentServersView';
import { domain, servers } from '../../../wailsjs/go/models';
import { GitState } from '../git';
import { MessageSquare, Globe, GitBranch, ListTodo, Terminal, X, Square } from 'lucide-react';
import { SpiralLoader } from './SpiralLoader';
import { TextShimmer } from './TextShimmer';
import { AgentStreamBlock, TodoToolBlockData } from './types';
import { AgentTasklistView } from './AgentTasklistView';
import { useSmoothScroll } from '../common/useSmoothScroll';

export type AgentSessionStatus = 'working' | 'finished' | 'idle' | 'error';

export type AgentCardMode = 'chat' | 'tasklist' | 'browser' | 'servers' | 'changes';

export interface AgentWindowProps {
  id?: string;
  title?: string;
  subtitle?: string;
  status?: AgentSessionStatus;
  /** Server timestamp of the running turn's start; shows a live timer while working. */
  workStartedAt?: number;
  /** Duration of the most recent finished turn in ms; shown when idle. */
  lastTurnMs?: number;
  /** Retained for backward compatibility */
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
  minSize?: { width: number; height: number };
  maxSize?: { width: number; height: number };
  modelId?: string;
  streamBlocks: AgentStreamBlock[];
  isFocused?: boolean;
  isAnimating?: boolean;
  mode?: 'deck' | 'grid';
  cardMode?: AgentCardMode;
  onCardModeChange?: (mode: AgentCardMode) => void;
  detectedServers?: servers.Server[];
  onStopServer?: (pid: number) => void;
  git?: GitState;
  onFocus?: () => void;
  onSendMessage?: (msg: string, modelId: string, files?: domain.FileRef[]) => void;
  onInterrupt?: () => void;
  onApprovePlan?: (blockId: string) => void;
  onAnswerQuestion?: (blockId: string, answers: string[]) => void;
  onSkipQuestion?: (blockId: string) => void;
  onClose?: () => void;
  onResize?: (width: number, height: number) => void;
  onResizeStart?: () => void;
  onResizeEnd?: () => void;
  cardWidth?: number;
  cardHeight?: number;
  className?: string;
  style?: React.CSSProperties;
}

const PANEL_STYLE: React.CSSProperties = {
  boxShadow:
    '0 28px 64px -12px rgba(0, 0, 0, 0.65), 0 4px 16px rgba(0, 0, 0, 0.35), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.22)',
};

const FEED_SCROLL_STYLE: React.CSSProperties = {
  overscrollBehavior: 'contain',
  willChange: 'scroll-position',
};

/** Compact duration label: 9s, 3m 04s, 1h 02m. */
function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m ${String(totalSeconds % 60).padStart(2, '0')}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

/**
 * AgentWindow Component
 * Sleek, non-draggable physical card matching Felix Haas (Lovable) design.
 * Adapts to Deck (focused carousel) and Grid (Exposé overview) modes.
 */
export const AgentWindow: React.FC<AgentWindowProps> = ({
  id,
  title = 'Agent',
  subtitle,
  status,
  workStartedAt,
  lastTurnMs,
  modelId,
  streamBlocks,
  isFocused = false,
  isAnimating = false,
  mode = 'deck',
  cardMode,
  onCardModeChange,
  detectedServers = [],
  onStopServer,
  git,
  onFocus,
  onSendMessage,
  onInterrupt,
  onApprovePlan,
  onAnswerQuestion,
  onSkipQuestion,
  onClose,
  onResize,
  onResizeStart,
  onResizeEnd,
  cardWidth,
  cardHeight,
  className = '',
  style,
}) => {
  const cardContainerRef = useRef<HTMLDivElement>(null);
  const feedScrollRef = useRef<HTMLDivElement>(null);
  const [internalMode, setInternalMode] = useState<AgentCardMode>('chat');
  const activeMode = cardMode !== undefined ? cardMode : internalMode;

  const [isDraggingResize, setIsDraggingResize] = useState(false);

  const [liveSize, setLiveSize] = useState({
    width: cardWidth || 680,
    height: cardHeight || 690,
  });

  useEffect(() => {
    if (!isDraggingResize) {
      setLiveSize({
        width: cardWidth || 680,
        height: cardHeight || 690,
      });
    }
  }, [cardWidth, cardHeight, isDraggingResize]);

  const handleGrabPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode === 'grid' || !onResize) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const rect = cardContainerRef.current?.getBoundingClientRect();
    const startW = rect ? Math.round(rect.width) : (cardWidth || 680);
    const startH = rect ? Math.round(rect.height) : (cardHeight || 690);

    let lastW = startW;
    let lastH = startH;

    setIsDraggingResize(true);
    onResizeStart?.();

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = startY - moveEvent.clientY; // dragging up increases height

      // Symmetrical expansion: dragging right increases width symmetrically
      const rawW = startW + deltaX * 2;
      const rawH = startH + deltaY;

      const STEP = 25;
      const snappedW = Math.round(rawW / STEP) * STEP;
      const snappedH = Math.round(rawH / STEP) * STEP;

      const minW = 650;
      const maxW = Math.min(1350, Math.floor((window.innerWidth - 60) / STEP) * STEP);
      const minH = 450;
      const maxH = Math.min(880, Math.floor((window.innerHeight - 80) / STEP) * STEP);

      const clampedW = Math.max(minW, Math.min(maxW, snappedW));
      const clampedH = Math.max(minH, Math.min(maxH, snappedH));

      if (clampedW !== lastW || clampedH !== lastH) {
        lastW = clampedW;
        lastH = clampedH;
        setLiveSize({ width: clampedW, height: clampedH });
        onResize(clampedW, clampedH);
      }
    };

    const handlePointerUp = () => {
      setIsDraggingResize(false);
      onResizeEnd?.();
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  const setMode = (m: AgentCardMode) => {
    if (onCardModeChange) onCardModeChange(m);
    else setInternalMode(m);
  };

  const smoothScroll = useSmoothScroll(feedScrollRef, {
    speed: 1.0,
    enabled: activeMode === 'chat' && mode !== 'grid',
  });

  const todoBlock = [...streamBlocks].reverse().find((b): b is TodoToolBlockData => b.type === 'tool_todo');
  const todos = todoBlock?.todos ?? [];
  const completedTasksCount = todos.filter((t) => t.status === 'completed').length;
  const totalTasksCount = todos.length;

  const webServers = (detectedServers || []).filter((s) => !s.agent && s.port > 0);
  const primaryServer = webServers[0];

  const matchingLane =
    git?.lanes.find(
      (l) =>
        (id && l.threadId === id) ||
        (subtitle && l.branch === subtitle) ||
        (l.title && id && l.title.includes(id)),
    ) || git?.lanes.find((l) => l.isMain);
  const changesCount = matchingLane?.files?.length ?? 0;

  const isWorking =
    status === 'working' ||
    (status === undefined &&
      streamBlocks.some(
        (b) =>
          (b.type === 'thinking' && b.isThinking) ||
          (b.type === 'tool_bash' && b.status === 'running') ||
          (b.type === 'tool_search' && b.isSearching),
      ));

  const hasLiveIndicator = streamBlocks.some(
    (block) => block.type === 'thinking' && block.isThinking,
  );

  const pinnedToBottom = useRef(true);

  const handleFeedScroll = () => {
    const el = feedScrollRef.current;
    if (!el) return;
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  // Auto-scroll feed on new content only if pinned to bottom
  useEffect(() => {
    if (feedScrollRef.current && pinnedToBottom.current) {
      if (smoothScroll.lenis.current) {
        smoothScroll.lenis.current.scrollTo(feedScrollRef.current.scrollHeight, { immediate: true });
      } else {
        feedScrollRef.current.scrollTop = feedScrollRef.current.scrollHeight;
      }
    }
  }, [streamBlocks, isWorking, smoothScroll]);

  const isGrid = mode === 'grid';

  const MODE_INDEX: Record<AgentCardMode, number> = {
    chat: 0,
    tasklist: 1,
    browser: 2,
    servers: 3,
    changes: 4,
  };

  const getTabStyle = (modeKey: AgentCardMode): React.CSSProperties => {
    const diff = MODE_INDEX[modeKey] - MODE_INDEX[activeMode];
    const isActive = diff === 0;
    return {
      transform: isActive
        ? 'none'
        : `translate3d(${diff > 0 ? '36px' : '-36px'}, 0, 0) scale(0.985)`,
      opacity: isActive ? 1 : 0,
      visibility: isActive ? 'visible' : 'hidden',
      pointerEvents: isActive && !isGrid ? 'auto' : 'none',
      zIndex: isActive ? 10 : 1,
      transition: isActive
        ? 'opacity 280ms cubic-bezier(0.16, 1, 0.3, 1) 50ms'
        : 'opacity 150ms cubic-bezier(0.4, 0, 1, 1)',
      willChange: isActive ? 'auto' : 'transform, opacity',
    };
  };

  const { currentTheme } = useTheme();
  const isLight = currentTheme.id === 'light' || currentTheme.id === 'white';

  return (
    <div
      ref={cardContainerRef}
      onClick={onFocus}
      className={`select-none transition-opacity duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        isGrid
          ? 'cursor-pointer group/card active:scale-[0.985] transition-transform duration-150 ease-out'
          : 'pointer-events-auto'
      } ${className}`}
      style={style}
    >
      <LiquidGlass
        variant="panel"
        surface="squircle"
        radius={24}
        bezelWidth={18}
        glassThickness={24}
        refractionScale={0.8}
        blur={0.55}
        disableRefraction={isGrid || currentTheme.glass.mode === 'stealth'}
        specularOpacity={isLight ? 0.3 : 0.65}
        specularSaturation={6}
        lightAngle={-45}
        tint="var(--theme-panel-bg)"
        shadow={isLight ? 'subtle' : 'apple'}
        border={
          isLight
            ? '1px solid var(--theme-panel-border, rgba(0, 0, 0, 0.08))'
            : '1px solid var(--theme-panel-border, rgba(255, 255, 255, 0.12))'
        }
        className={`w-full h-full p-4 ${isLight ? 'text-[#030303]' : 'text-white'} shadow-2xl relative box-border transition-all duration-200 ease-out ${
          isGrid
            ? (isLight
                ? 'group-hover/card:border-black/25 group-hover/card:shadow-[0_20px_48px_-12px_rgba(0,0,0,0.2),0_0_0_1px_rgba(0,0,0,0.1)]'
                : 'group-hover/card:border-white/35 group-hover/card:shadow-[0_28px_64px_-12px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.15)]')
            : ''
        }`}
        style={isLight ? {
          boxShadow: '0 20px 48px -12px rgba(0, 0, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.06), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.9)',
        } : PANEL_STYLE}
      >
        <div className="flex flex-col h-full w-full min-h-0 overflow-hidden">
          {/* Top Grab Accent Handle (signature Lovable pill) - Draggable to resize card with stepped jumping */}
          <div
            onPointerDown={handleGrabPointerDown}
            title={mode !== 'grid' ? "Drag to resize card (25px steps)" : undefined}
            className={`relative -mt-1 mb-1.5 py-1 px-8 mx-auto shrink-0 flex items-center justify-center select-none group/handle z-30 ${
              mode !== 'grid' ? 'cursor-ns-resize' : ''
            }`}
          >
            <div
              className={`w-12 h-1.5 rounded-full transition-all duration-150 ${
                isDraggingResize
                  ? (isLight ? 'bg-black/65 scale-x-125 ring-2 ring-black/20' : 'bg-white/80 scale-x-125 ring-2 ring-white/30')
                  : (isLight ? 'bg-black/20 group-hover/handle:bg-black/45 group-hover/handle:scale-x-115' : 'bg-white/20 group-hover/handle:bg-white/55 group-hover/handle:scale-x-115')
              }`}
            />

            {/* Floating dimensions pill during resize */}
            {isDraggingResize && (
              <div
                className={`absolute -top-7 px-2.5 py-0.5 rounded-full text-[10.5px] font-mono font-medium tracking-tight shadow-xl border backdrop-blur-md pointer-events-none whitespace-nowrap animate-in fade-in duration-100 ${
                  isLight
                    ? 'bg-black/85 text-white border-black/10'
                    : 'bg-[#18181b]/95 text-white/95 border-white/20 shadow-[0_4px_16px_rgba(0,0,0,0.6)]'
                }`}
              >
                {liveSize.width} × {liveSize.height}
              </div>
            )}
          </div>

          {/* Card Header (Reinvented: seamless, borderless, organic glass) */}
          <div className="flex items-center justify-between shrink-0 pt-0.5 pb-2 px-1">
            <div className="flex items-center gap-2 min-w-0 pr-2">
              {/* Status Dot: Pulsing Emerald when working, subtle white when idle */}
              <span
                className={`w-2 h-2 rounded-full shrink-0 transition-all duration-300 ${
                  isWorking
                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse'
                    : (isLight ? 'bg-black/30' : 'bg-white/30')
                }`}
              />

              <div className="flex items-baseline gap-1.5 min-w-0 truncate">
                <span className={`text-[13px] font-semibold font-['Geist'] tracking-tight truncate ${isLight ? 'text-[#030303]' : 'text-white'}`}>
                  {title}
                </span>
                {subtitle && (
                  <span className={`text-[11px] font-medium font-['Geist'] tracking-tight truncate hidden sm:inline ${isLight ? 'text-black/45' : 'text-white/40'}`}>
                    · {subtitle}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Grid Mode: Expanded Dimensions Badge */}
              {isGrid && ((cardWidth && cardWidth !== 680) || (cardHeight && cardHeight !== 690)) && (
                <div
                  title={`Expanded tab size: ${cardWidth || 680}px × ${cardHeight || 690}px`}
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-mono font-medium tracking-tight border backdrop-blur-md shrink-0 shadow-sm ${
                    isLight
                      ? 'bg-black/[0.06] text-black/75 border-black/10'
                      : 'bg-white/[0.12] text-white/85 border-white/15'
                  }`}
                >
                  <span className="text-[11px] opacity-60">⤢</span>
                  <span>{cardWidth || 680} × {cardHeight || 690}</span>
                </div>
              )}

              {/* Mode Switcher: Chat / Web Preview / Git Changes (Always visible in both deck and grid modes) */}
              <div className="flex items-center p-0.5 rounded-full bg-white/[0.08] backdrop-blur-md shrink-0 border border-white/[0.08] shadow-inner">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMode('chat');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium font-['Geist'] transition-all cursor-pointer ${
                    activeMode === 'chat'
                      ? 'bg-white/[0.16] text-white shadow-[0_2px_8px_rgba(0,0,0,0.35)] font-semibold border border-white/10'
                      : 'text-white/45 hover:text-white/85 hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  <MessageSquare size={13} className="shrink-0" />
                  <span>Chat</span>
                </button>

                <button
                  type="button"
                  title={
                    totalTasksCount > 0
                      ? `${completedTasksCount} of ${totalTasksCount} tasks completed`
                      : 'Agent tasklist'
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    setMode('tasklist');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium font-['Geist'] transition-all cursor-pointer ${
                    activeMode === 'tasklist'
                      ? 'bg-white/[0.16] text-white shadow-[0_2px_8px_rgba(0,0,0,0.35)] font-semibold border border-white/10'
                      : 'text-white/45 hover:text-white/85 hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  <ListTodo size={13} className="shrink-0" />
                  <span>Tasklist</span>
                  {totalTasksCount > 0 && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-semibold shrink-0 ${
                        completedTasksCount === totalTasksCount
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-white/15 text-white/90 border border-white/10'
                      }`}
                    >
                      {completedTasksCount}/{totalTasksCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  title={
                    primaryServer
                      ? `Preview dev server (localhost:${primaryServer.port})`
                      : 'Web preview'
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    setMode('browser');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium font-['Geist'] transition-all cursor-pointer ${
                    activeMode === 'browser'
                      ? 'bg-white/[0.16] text-white shadow-[0_2px_8px_rgba(0,0,0,0.35)] font-semibold border border-white/10'
                      : 'text-white/45 hover:text-white/85 hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  <Globe size={13} className="shrink-0" />
                  <span>Preview</span>
                  {primaryServer && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)] animate-pulse shrink-0" />
                  )}
                </button>

                <button
                  type="button"
                  title={
                    detectedServers.length > 0
                      ? `${detectedServers.length} dev server${detectedServers.length === 1 ? '' : 's'}`
                      : 'Dev servers'
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    setMode('servers');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium font-['Geist'] transition-all cursor-pointer ${
                    activeMode === 'servers'
                      ? 'bg-white/[0.16] text-white shadow-[0_2px_8px_rgba(0,0,0,0.35)] font-semibold border border-white/10'
                      : 'text-white/45 hover:text-white/85 hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  <Terminal size={13} className="shrink-0" />
                  <span>Servers</span>
                  {detectedServers.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                      {detectedServers.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  title={
                    changesCount > 0
                      ? `${changesCount} uncommitted change${changesCount === 1 ? '' : 's'}`
                      : 'Git changes'
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    setMode('changes');
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium font-['Geist'] transition-all cursor-pointer ${
                    activeMode === 'changes'
                      ? 'bg-white/[0.16] text-white shadow-[0_2px_8px_rgba(0,0,0,0.35)] font-semibold border border-white/10'
                      : 'text-white/45 hover:text-white/85 hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  <GitBranch size={13} className="shrink-0" />
                  <span>Changes</span>
                  {changesCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                      {changesCount}
                    </span>
                  )}
                </button>
              </div>

              {/* Minimalist Borderless Close Button */}
              {onClose && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                  }}
                  title="Close and terminate agent"
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 active:scale-90 transition-all cursor-pointer pointer-events-auto"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Card Body: Chat Feed, Embedded Browser, and Embedded Git View with Liquid Directional Crossfade */}
          <div className="flex-1 min-h-0 h-0 relative overflow-hidden">
            {/* 1. Chat Feed View */}
            <div
              ref={feedScrollRef}
              onScroll={handleFeedScroll}
              className={`absolute inset-0 overflow-y-auto overflow-x-hidden custom-scrollbar py-2.5 pr-2 ${
                isGrid ? 'pointer-events-none select-none' : ''
              }`}
              style={{ ...FEED_SCROLL_STYLE, ...getTabStyle('chat') }}
            >
              <div className="w-full min-w-0 flex flex-col">
                <AgentSessionFeed
                  blocks={streamBlocks}
                  threadId={id}
                  onApprovePlan={onApprovePlan}
                  onAnswerQuestion={onAnswerQuestion}
                  onSkipQuestion={onSkipQuestion}
                />

                {isWorking && !hasLiveIndicator && (
                  <div className="flex items-center gap-2 pt-3 pl-0.5">
                    <SpiralLoader size={13} />
                    <TextShimmer
                      duration={1.5}
                      className="text-[12px] font-medium font-['Geist'] tracking-tight"
                    >
                      Thinking
                    </TextShimmer>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Embedded Tasklist View */}
            <div
              className={`absolute inset-0 flex flex-col pt-1 ${
                isGrid ? 'pointer-events-none select-none' : ''
              }`}
              style={getTabStyle('tasklist')}
            >
              <AgentTasklistView
                threadId={id}
                todos={todos}
                isWorking={isWorking}
              />
            </div>

            {/* 3. Embedded Browser / Web Preview View */}
            <div
              className={`absolute inset-0 flex flex-col pt-1 ${
                isGrid ? 'pointer-events-none select-none' : ''
              }`}
              style={getTabStyle('browser')}
            >
              <AgentBrowserView
                threadId={id}
                detectedServers={detectedServers}
                isFocused={isFocused && activeMode === 'browser' && !isGrid}
                isAnimating={isAnimating}
                onFocusCard={onFocus}
              />
            </div>

            {/* 4. Embedded Servers View */}
            <div
              className={`absolute inset-0 flex flex-col pt-1 ${
                isGrid ? 'pointer-events-none select-none' : ''
              }`}
              style={getTabStyle('servers')}
            >
              <AgentServersView
                threadId={id}
                servers={detectedServers}
                onStopServer={onStopServer}
                onPreview={() => setMode('browser')}
              />
            </div>

            {/* 5. Embedded Git Changes View */}
            <div
              className={`absolute inset-0 flex flex-col pt-1 ${
                isGrid ? 'pointer-events-none select-none' : ''
              }`}
              style={getTabStyle('changes')}
            >
              <AgentGitView
                threadId={id}
                branch={subtitle}
                git={git}
              />
            </div>

            {/* In Grid / Exposé mode, full shield prevents iframe/feed stealing click so card zooms smoothly */}
            {isGrid && <div className="absolute inset-0 z-30 cursor-pointer" />}
          </div>

        </div>
      </LiquidGlass>
    </div>
  );
};

export default AgentWindow;
