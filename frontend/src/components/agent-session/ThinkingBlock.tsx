import React, { useEffect, useState } from 'react';
import { SpiralLoader } from './SpiralLoader';
import { TextShimmer } from './TextShimmer';

export interface ThinkingBlockProps {
  isThinking?: boolean;
  thoughtText?: string;
  durationSeconds?: number;
  defaultExpanded?: boolean;
  className?: string;
}

/**
 * Thinking Tool component with active streaming & completed collapsed states.
 * - Active State: Spiral Loader (16px) + TextShimmer "Thinking" (12px Geist font)
 * - Done State: "Thought for Xs >" (40% white opacity, 12px Geist font, comfortable padding)
 * - Glass Chat Bubble: 12px Geist font, frosted translucent white glass container
 */
const ThinkingBlockImpl: React.FC<ThinkingBlockProps> = ({
  isThinking = false,
  thoughtText = '',
  durationSeconds = 3,
  defaultExpanded,
  className = '',
}) => {
  // Collapsed unless explicitly opened: reasoning is supporting detail, so it
  // should not push the answer off screen while it streams.
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded ?? false);

  // Live elapsed timer while thinking, Zeron-style "Thinking… Ns".
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isThinking) return;
    setElapsed(0);
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => window.clearInterval(id);
  }, [isThinking]);

  const toggleExpand = () => {
    setIsExpanded((prev) => !prev);
  };

  const doneSeconds = durationSeconds > 0 ? durationSeconds : elapsed;

  return (
    <div className={`flex flex-col gap-1.5 select-none ${className}`}>
      {/* Trigger Header Button with comfortable horizontal padding */}
      <button
        type="button"
        onClick={toggleExpand}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] hover:bg-current/[0.06] active:scale-95 transition-all duration-150 cursor-pointer self-start group ${
          isThinking ? 'text-current' : 'text-current/40 hover:text-current/80'
        }`}
      >
        {isThinking ? (
          <>
            <SpiralLoader size={16} className="text-current/90" />
            <TextShimmer duration={1.5} className="text-[12px] font-medium font-['Geist'] tracking-tight select-none leading-none">
              Thinking… {elapsed > 0 ? `${elapsed}s` : ''}
            </TextShimmer>
            <span className="flex items-center gap-[3px] ml-0.5" aria-hidden>
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="w-[3px] h-[3px] rounded-full bg-current/60 animate-pulse"
                  style={{ animationDelay: `${dot * 0.25}s` }}
                />
              ))}
            </span>
          </>
        ) : (
          <span className="text-[12px] font-medium font-['Geist'] tracking-tight select-none leading-none">
            Thought for {doneSeconds}s
          </span>
        )}

        {/* Chevron Indicator */}
        <span
          className={`material-symbols-outlined text-[15px] leading-none transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isExpanded ? 'rotate-90' : 'rotate-0'
          } ${isThinking ? 'text-current/90' : 'text-current/40'}`}
        >
          chevron_right
        </span>
      </button>

      {/* Collapsible Frosted White Glass Chat Bubble Panel */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-220 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{
          gridTemplateRows: isExpanded ? '1fr' : '0fr',
          opacity: isExpanded ? 1 : 0,
          pointerEvents: isExpanded ? 'auto' : 'none',
        }}
      >
        <div className="overflow-hidden">
          <div
            className="rounded-[14px] glass-card border border-current/15 px-3.5 py-2.5 max-w-full text-[12px] font-['Geist'] text-current leading-relaxed tracking-tight select-text shadow-md font-medium"
            style={{
              boxShadow:
                '0 4px 16px rgba(0, 0, 0, 0.2), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.35)',
            }}
          >
            {isThinking && !thoughtText ? (
              <span className="text-current/50">Reasoning…</span>
            ) : (
              thoughtText
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const ThinkingBlock = React.memo(ThinkingBlockImpl);
ThinkingBlock.displayName = 'ThinkingBlock';

export default ThinkingBlock;
