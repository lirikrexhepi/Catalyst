import React, { useEffect, useRef } from 'react';
import { LiquidGlass } from '../../liquid-glass';
import { ScrollArea } from '../common/ScrollArea';
import { AgentSessionFeed, AgentStreamBlock } from '../agent-session';
import { SpiralLoader } from '../agent-session/SpiralLoader';
import { TextShimmer } from '../agent-session/TextShimmer';

export interface CoordinatorPanelProps {
  blocks: AgentStreamBlock[];
  isBusy?: boolean;
  /** Surfaced only when it is not already in the transcript (e.g. send failed). */
  error?: string | null;
  maxHeight?: number;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
  className?: string;
}

/**
 * Glass transcript panel beneath the orchestrator input. Renders the
 * coordinator conversation through the shared agent feed so formatting matches
 * the agent windows.
 */
export const CoordinatorPanel: React.FC<CoordinatorPanelProps> = ({
  blocks,
  isBusy = false,
  error,
  maxHeight = 380,
  isCollapsed = false,
  onToggleCollapsed,
  className = '',
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  // Follow the stream only while the user is already at the bottom, so reading
  // back through history is not yanked away by incoming tokens.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinnedToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [blocks]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  if (blocks.length === 0 && !error) return null;

  // turn.failed already lands in the transcript, so only show the banner for
  // errors that never became events.
  const bannerError =
    error && !blocks.some((block) => block.type === 'text' && block.content.includes(error))
      ? error
      : null;

  // A streaming thinking block carries its own spinner and label.
  const hasLiveIndicator = blocks.some(
    (block) => block.type === 'thinking' && block.isThinking,
  );

  const turnCount = blocks.filter((block) => block.type === 'user').length;

  return (
    <LiquidGlass
      variant="panel"
      surface="squircle"
      radius={18}
      bezelWidth={18}
      glassThickness={24}
      refractionScale={0.8}
      blur={0.4}
      specularOpacity={0.8}
      specularSaturation={6}
      lightAngle={-45}
      tint="rgba(0, 0, 0, 0.20)"
      shadow="apple"
      border="1px solid rgba(255, 255, 255, 0.18)"
      className={`w-[580px] ${className}`}
      style={{
        boxShadow:
          '0 20px 54px rgba(0, 0, 0, 0.55), 0 4px 14px rgba(0, 0, 0, 0.35), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.25)',
      }}
    >
      {/* Header strip: message count plus the collapse toggle. */}
      <div className="flex items-center justify-between px-3.5 pt-2.5 pb-1.5">
        <span className="text-[11px] font-medium font-['Geist'] text-white/35 tracking-tight select-none">
          {isBusy ? 'Working' : `${turnCount} message${turnCount === 1 ? '' : 's'}`}
        </span>
        <button
          type="button"
          title={isCollapsed ? 'Show transcript' : 'Hide transcript'}
          onClick={onToggleCollapsed}
          className="w-[22px] h-[22px] rounded-[6px] hover:bg-white/10 active:scale-90 flex items-center justify-center transition-all duration-150 cursor-pointer group"
        >
          <span
            className={`material-symbols-outlined text-[17px] text-white/45 group-hover:text-white/90 leading-none transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              isCollapsed ? 'rotate-180' : 'rotate-0'
            }`}
          >
            expand_less
          </span>
        </button>
      </div>

      <div
        className="grid transition-[grid-template-rows,opacity] duration-220 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{
          gridTemplateRows: isCollapsed ? '0fr' : '1fr',
          opacity: isCollapsed ? 0 : 1,
          pointerEvents: isCollapsed ? 'none' : 'auto',
        }}
      >
      <div className="overflow-hidden">
      <ScrollArea ref={scrollRef} maxHeight={maxHeight} onScroll={handleScroll} className="px-4 pb-4">
        <AgentSessionFeed blocks={blocks} />

        {/* The feed already renders its own spinner while a thinking block is
            streaming, so this only covers the gap before any block arrives. */}
        {isBusy && !hasLiveIndicator && (
          <div className="flex items-center gap-2 pt-3 pl-0.5">
            <SpiralLoader size={13} />
            <TextShimmer duration={1.5} className="text-[12px] font-medium font-['Geist'] tracking-tight">
              Thinking
            </TextShimmer>
          </div>
        )}

        {bannerError && (
          <div className="mt-3 px-3 py-2 rounded-[9px] bg-red-500/10 border border-red-400/25">
            <span className="text-[12px] font-medium font-['Geist'] text-red-200/90 leading-relaxed">
              {bannerError}
            </span>
          </div>
        )}
      </ScrollArea>
      </div>
      </div>
    </LiquidGlass>
  );
};

export default CoordinatorPanel;
