import React, { useRef, useEffect, useState, useMemo } from 'react';
import { LiquidGlass } from '../../liquid-glass';
import { useTheme } from '../../themes';
import { AgentSessionFeed } from './AgentSessionFeed';
import { AgentBrowserView } from './AgentBrowserView';
import { AgentGitView } from './AgentGitView';
import { AgentServersView } from './AgentServersView';
import { domain, servers } from '../../../wailsjs/go/models';
import { GitState } from '../git';
import { X, Square, Folder, Minimize } from '../common/icons';
import { OrbitLoader } from './OrbitLoader';
import { TextShimmer } from './TextShimmer';
import { AgentStreamBlock, TodoToolBlockData } from './types';
import { AgentTasklistView } from './AgentTasklistView';
import { AgentViewSwitcher } from './AgentViewSwitcher';
import { useSmoothScroll } from '../common/useSmoothScroll';
import { usePinnedScroll } from '../common/usePinnedScroll';
import { ContextRing } from './ContextRing';
import type { ContextUsage } from './contextUsage';
import { parseSwitchNotice } from './NoticeDivider';
import { formatModelBadge, renderChatIcon } from '../common/DynamicIsland';

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
  contextUsage?: ContextUsage;
  /** Retained for backward compatibility */
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
  minSize?: { width: number; height: number };
  maxSize?: { width: number; height: number };
  modelId?: string;
  driver?: string;
  drivers?: string[];
  models?: string[];
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
  projectName?: string;
  isFullscreen?: boolean;
  onEnterFullscreen?: () => void;
  onExitFullscreen?: () => void;
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
const AgentWindowImpl: React.FC<AgentWindowProps> = ({
  id,
  title = 'Agent',
  subtitle,
  status,
  workStartedAt,
  lastTurnMs,
  contextUsage,
  modelId,
  driver,
  drivers,
  models,
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
  projectName,
  isFullscreen = false,
  onEnterFullscreen,
  onExitFullscreen,
  cardWidth,
  cardHeight,
  className = '',
  style,
}) => {
  const cardContainerRef = useRef<HTMLDivElement>(null);
  const feedScrollRef = useRef<HTMLDivElement>(null);
  const [internalMode, setInternalMode] = useState<AgentCardMode>('chat');
  const activeMode = cardMode !== undefined ? cardMode : internalMode;

  const driverProgression = useMemo(() => {
    const steps: Array<{ driver: string; model?: string }> = [];

    // 1. Scan streamBlocks for notice switches
    for (const b of streamBlocks) {
      if (b.type === 'notice' && b.label) {
        const parsed = parseSwitchNotice(b.label);
        if (parsed) {
          if (parsed.fromDriver && steps.length === 0) {
            steps.push({ driver: parsed.fromDriver, model: parsed.fromModel });
          }
          if (parsed.toDriver) {
            const prev = steps[steps.length - 1];
            if (!prev || prev.driver.toLowerCase() !== parsed.toDriver.toLowerCase() || (parsed.toModel && prev.model !== parsed.toModel)) {
              steps.push({ driver: parsed.toDriver, model: parsed.toModel });
            }
          }
        }
      }
    }

    // 2. Fallback to passed drivers/models array if available and multiple
    if (steps.length === 0 && Array.isArray(drivers) && drivers.length > 1) {
      for (let i = 0; i < drivers.length; i++) {
        const d = drivers[i];
        if (d && !steps.some((s) => s.driver.toLowerCase() === d.toLowerCase())) {
          steps.push({ driver: d, model: models?.[i] });
        }
      }
    }

    // 3. If there is a current driver that is different from the first step
    if (steps.length === 1 && driver && driver.toLowerCase() !== steps[0].driver.toLowerCase()) {
      steps.push({ driver, model: modelId });
    }

    return steps;
  }, [streamBlocks, drivers, models, driver, modelId]);

  const activeDriver = useMemo(() => {
    if (driverProgression.length > 0) {
      return driverProgression[driverProgression.length - 1].driver;
    }
    return driver || 'antigravity';
  }, [driverProgression, driver]);

  const activeModel = useMemo(() => {
    if (driverProgression.length > 0) {
      return driverProgression[driverProgression.length - 1].model || modelId;
    }
    return modelId;
  }, [driverProgression, modelId]);
  // Secondary tabs (browser iframe, git, servers) mount on first visit only,
  // instead of every card running all five views at once.
  const [visited, setVisited] = useState<ReadonlySet<AgentCardMode>>(() => new Set<AgentCardMode>(['chat']));
  useEffect(() => {
    setVisited((prev) => (prev.has(activeMode) ? prev : new Set([...prev, activeMode])));
  }, [activeMode]);

  const OVERSHOOT_PX = 40;
  const OVERSHOOT_HOLD_MS = 650;
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
    if (mode === 'grid' || !onResize || isFullscreen) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const rect = cardContainerRef.current?.getBoundingClientRect();
    const startW = rect ? Math.round(rect.width) : (cardWidth || 680);
    const startH = rect ? Math.round(rect.height) : (cardHeight || 690);

    let lastW = startW;
    let lastH = startH;
    let overshootTimer = 0;

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
      const maxH = Math.min(880, Math.floor((window.innerHeight - 190) / STEP) * STEP);

      const clampedW = Math.max(minW, Math.min(maxW, snappedW));
      const clampedH = Math.max(minH, Math.min(maxH, snappedH));

      const overshoot = rawH - maxH > OVERSHOOT_PX || rawW - maxW > OVERSHOOT_PX * 2;
      if (overshoot && !overshootTimer && onEnterFullscreen) {
        overshootTimer = window.setTimeout(() => {
          stopDrag();
          onEnterFullscreen();
        }, OVERSHOOT_HOLD_MS);
      } else if (!overshoot && overshootTimer) {
        window.clearTimeout(overshootTimer);
        overshootTimer = 0;
      }

      if (clampedW !== lastW || clampedH !== lastH) {
        lastW = clampedW;
        lastH = clampedH;
        setLiveSize({ width: clampedW, height: clampedH });
        onResize(clampedW, clampedH);
      }
    };

    const stopDrag = () => {
      window.clearTimeout(overshootTimer);
      overshootTimer = 0;
      setIsDraggingResize(false);
      onResizeEnd?.();
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDrag);
      window.removeEventListener('pointercancel', stopDrag);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);
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

  usePinnedScroll(feedScrollRef, [streamBlocks, isWorking], {
    scroll: (el, top) => {
      const lenis = smoothScroll.lenis.current;
      if (lenis) {
        lenis.scrollTo(top, { duration: 0.32, easing: (t: number) => 1 - Math.pow(2, -10 * t) });
      } else {
        el.scrollTop = top;
      }
    },
    snap: (el, top) => {
      const lenis = smoothScroll.lenis.current;
      if (lenis) {
        lenis.scrollTo(top, { immediate: true });
      } else {
        el.scrollTop = top;
      }
    },
    onUnpin: () => smoothScroll.stopGlide(),
  });

  const isGrid = mode === 'grid';

  const MODE_INDEX: Record<AgentCardMode, number> = {
    chat: 0,
    tasklist: 1,
    browser: 2,
    servers: 3,
    changes: 4,
  };

  const insetForDock = (base: React.CSSProperties): React.CSSProperties =>
    isFullscreen ? { ...base, bottom: 140 } : base;

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
        radius={isFullscreen ? 0 : 24}
        bezelWidth={18}
        glassThickness={24}
        refractionScale={0.8}
        blur={0.55}
        disableRefraction={isGrid || isFullscreen || currentTheme.glass.mode === 'stealth'}
        specularOpacity={isLight ? 0.3 : 0.65}
        specularSaturation={6}
        lightAngle={-45}
        tint={isFullscreen ? (isLight ? '#f7f7f9' : '#0b0b0d') : 'var(--theme-panel-bg)'}
        shadow={isLight ? 'subtle' : 'apple'}
        border={
          isLight
            ? (isFullscreen ? 'none' : '1px solid var(--theme-panel-border, rgba(0, 0, 0, 0.08))')
            : (isFullscreen ? 'none' : '1px solid var(--theme-panel-border, rgba(255, 255, 255, 0.12))')
        }
        className={`w-full h-full ${isFullscreen ? 'p-4 pt-[60px]' : 'p-4'} ${isLight ? 'text-[#030303]' : 'text-white'} shadow-2xl relative box-border transition-all duration-200 ease-out ${
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
            className={`relative -mt-1 mb-1.5 py-1 px-8 mx-auto shrink-0 flex items-center justify-center select-none group/handle z-30 ${isFullscreen ? 'hidden' : ''} ${
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
            <div className="flex items-center gap-2 min-w-0 pr-2" style={isFullscreen ? { maxWidth: 'calc(100% - 140px)' } : undefined}>
              {/* Active Driver Icon with live working indicator */}
              <div
                className="relative flex items-center justify-center shrink-0"
                title={`Active CLI: ${activeDriver}${activeModel ? ` (${formatModelBadge(activeModel, activeDriver)})` : ''}`}
              >
                {renderChatIcon(activeDriver, activeModel, isLight, 'w-[15px] h-[15px]')}
                {isWorking && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-1 ring-black/40 shadow-[0_0_6px_rgba(52,211,153,0.9)] animate-pulse" />
                )}
              </div>

              <div className="flex items-baseline gap-1.5 min-w-0 truncate">
                <span className={`text-[13px] font-semibold font-(family-name:--app-font) tracking-tight truncate ${isLight ? 'text-[#030303]' : 'text-white'}`}>
                  {title}
                </span>
                {projectName && (
                  <span className={'inline-flex items-center gap-1 shrink-0 text-[11px] font-medium font-(family-name:--app-font) tracking-tight ' + (isLight ? 'text-black/55' : 'text-white/50')} title={'Project: ' + projectName}>
                    <Folder size={12} strokeWidth={1.75} />
                    {projectName}
                  </span>
                )}
                {subtitle && (
                  <span className={`text-[11px] font-medium font-(family-name:--app-font) tracking-tight truncate hidden sm:inline ${isLight ? 'text-black/45' : 'text-white/40'}`}>
                    · {subtitle}
                  </span>
                )}
              </div>

              {/* CLI Transition Story Pill (e.g. [Antigravity] → [Codex]) */}
              {driverProgression.length > 1 && (
                <div
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium tracking-tight border backdrop-blur-md shrink-0 select-none shadow-xs transition-all ${
                    isLight
                      ? 'bg-black/[0.05] text-black/75 border-black/10 hover:bg-black/[0.08]'
                      : 'bg-white/[0.08] text-white/85 border-white/10 hover:bg-white/[0.12]'
                  }`}
                  title={`CLI transition: ${driverProgression.map((s) => `${s.driver}${s.model ? ` (${formatModelBadge(s.model, s.driver)})` : ''}`).join(' → ')}`}
                >
                  {driverProgression.map((step, idx) => (
                    <React.Fragment key={idx}>
                      {idx > 0 && (
                        <span className={`text-[10px] leading-none ${isLight ? 'text-black/40' : 'text-white/40'}`}>
                          →
                        </span>
                      )}
                      <span
                        className="inline-flex items-center justify-center shrink-0"
                        title={step.model ? `${step.driver}: ${formatModelBadge(step.model, step.driver)}` : step.driver}
                      >
                        {renderChatIcon(step.driver, step.model, isLight, 'w-[13px] h-[13px]')}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              )}

              <ContextRing usage={contextUsage} isLight={isLight} />
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

              <AgentViewSwitcher
                mode={activeMode}
                onChange={setMode}
                tasks={{ done: completedTasksCount, total: totalTasksCount }}
                servers={detectedServers.length}
                changes={changesCount}
                isLight={isLight}
              />

              {isFullscreen && onExitFullscreen && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onExitFullscreen();
                  }}
                  title="Exit full screen (Esc)"
                  aria-label="Exit full screen"
                  className={'w-[28px] h-[28px] rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer active:scale-90 pointer-events-auto ' + (isLight ? 'bg-black/[0.06] text-black/60 hover:bg-black/[0.12] hover:text-black' : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white')}
                >
                  <Minimize size={14} strokeWidth={2} />
                </button>
              )}

              {/* Minimalist Borderless Close Button */}
              {onClose && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                  }}
                  title="Close and terminate agent"
                  aria-label="Close and terminate agent"
                  className={`w-[28px] h-[28px] rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer active:scale-90 pointer-events-auto ${
                    isLight
                      ? 'bg-black/[0.06] text-black/60 hover:bg-black/[0.12] hover:text-black'
                      : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'
                  }`}
                >
                  <X size={14} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>

          {/* Card Body: Chat Feed, Embedded Browser, and Embedded Git View with Liquid Directional Crossfade */}
          <div className="flex-1 min-h-0 h-0 relative overflow-hidden">
            {/* 1. Chat Feed View */}
            <div
              ref={feedScrollRef}
              className={`absolute inset-0 overflow-y-auto overflow-x-hidden custom-scrollbar py-2.5 ${isFullscreen ? 'pb-[150px] px-4' : 'pr-2'} ${
                isGrid ? 'pointer-events-none select-none' : ''
              }`}
              style={{ ...FEED_SCROLL_STYLE, ...getTabStyle('chat') }}
            >
              <div className={`w-full min-w-0 flex flex-col ${isFullscreen ? 'max-w-[880px] mx-auto' : ''}`}>
                <AgentSessionFeed
                  blocks={streamBlocks}
                  threadId={id}
                  modelId={activeModel}
                  driver={activeDriver}
                  isWorking={isWorking}
                  onApprovePlan={onApprovePlan}
                  onAnswerQuestion={onAnswerQuestion}
                  onSkipQuestion={onSkipQuestion}
                />

                {isWorking && !hasLiveIndicator && (
                  <div className="flex items-center gap-2 pt-3 pl-0.5">
                    <OrbitLoader size={13} />
                    <TextShimmer
                      duration={1.5}
                      className="text-[12px] font-medium font-(family-name:--app-font) tracking-tight"
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
              style={insetForDock(getTabStyle('tasklist'))}
            >
              {visited.has('tasklist') && (
                <AgentTasklistView
                  threadId={id}
                  todos={todos}
                  isWorking={isWorking}
                />
              )}
            </div>

            {/* 3. Embedded Browser / Web Preview View */}
            <div
              className={`absolute inset-0 flex flex-col pt-1 ${
                isGrid ? 'pointer-events-none select-none' : ''
              }`}
              style={insetForDock(getTabStyle('browser'))}
            >
              {visited.has('browser') && (
                <AgentBrowserView
                  threadId={id}
                  detectedServers={detectedServers}
                  isFocused={isFocused && activeMode === 'browser' && !isGrid}
                  isAnimating={isAnimating}
                  onFocusCard={onFocus}
                />
              )}
            </div>

            {/* 4. Embedded Servers View */}
            <div
              className={`absolute inset-0 flex flex-col pt-1 ${
                isGrid ? 'pointer-events-none select-none' : ''
              }`}
              style={insetForDock(getTabStyle('servers'))}
            >
              {visited.has('servers') && (
                <AgentServersView
                  threadId={id}
                  servers={detectedServers}
                  onStopServer={onStopServer}
                  onPreview={() => setMode('browser')}
                />
              )}
            </div>

            {/* 5. Embedded Git Changes View */}
            <div
              className={`absolute inset-0 flex flex-col pt-1 ${
                isGrid ? 'pointer-events-none select-none' : ''
              }`}
              style={insetForDock(getTabStyle('changes'))}
            >
              {visited.has('changes') && (
                <AgentGitView
                  threadId={id}
                  branch={subtitle}
                  git={git}
                />
              )}
            </div>

            {/* In Grid / Exposé mode, full shield prevents iframe/feed stealing click so card zooms smoothly */}
            {isGrid && <div className="absolute inset-0 z-30 cursor-pointer" />}
          </div>

        </div>
      </LiquidGlass>
    </div>
  );
};

function sameServers(a?: servers.Server[], b?: servers.Server[]) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((server, i) => server.pid === b[i].pid && server.port === b[i].port);
}

function sameProps(prev: AgentWindowProps, next: AgentWindowProps) {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]) as Set<keyof AgentWindowProps>;
  for (const key of keys) {
    const a = prev[key];
    const b = next[key];
    if (typeof a === 'function' && typeof b === 'function') continue;
    if (key === 'detectedServers') {
      if (!sameServers(a as servers.Server[] | undefined, b as servers.Server[] | undefined)) return false;
      continue;
    }
    if (!Object.is(a, b)) return false;
  }
  return true;
}

const MemoAgentWindow = React.memo(AgentWindowImpl, sameProps);

export const AgentWindow: React.FC<AgentWindowProps> = (props) => {
  const latest = React.useRef(props);
  latest.current = props;
  const proxies = React.useRef(new Map<string, (...args: unknown[]) => unknown>());
  const stable = {} as Record<string, unknown>;
  for (const [key, value] of Object.entries(props)) {
    if (typeof value !== 'function') {
      stable[key] = value;
      continue;
    }
    let proxy = proxies.current.get(key);
    if (!proxy) {
      proxy = (...args: unknown[]) => (latest.current as unknown as Record<string, (...a: unknown[]) => unknown>)[key]?.(...args);
      proxies.current.set(key, proxy);
    }
    stable[key] = proxy;
  }
  return <MemoAgentWindow {...(stable as unknown as AgentWindowProps)} />;
};

export default AgentWindow;
