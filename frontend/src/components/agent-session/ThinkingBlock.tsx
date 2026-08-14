import React, { useState } from 'react';
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
  const [isExpanded, setIsExpanded] = useState<boolean>(
    defaultExpanded !== undefined ? defaultExpanded : isThinking
  );

  const toggleExpand = () => {
    setIsExpanded((prev) => !prev);
  };

  return (
    <div className={`flex flex-col gap-1.5 select-none ${className}`}>
      {/* Trigger Header Button with comfortable horizontal padding */}
      <button
        type="button"
        onClick={toggleExpand}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] hover:bg-white/10 active:scale-95 transition-all duration-150 cursor-pointer self-start group ${
          isThinking ? 'text-white' : 'text-white/40 hover:text-white/80'
        }`}
      >
        {isThinking ? (
          <>
            <SpiralLoader size={16} className="text-white/90" />
            <TextShimmer duration={1.5} className="text-[12px] font-medium font-['Geist'] tracking-tight select-none leading-none">
              Thinking
            </TextShimmer>
          </>
        ) : (
          <span className="text-[12px] font-medium font-['Geist'] tracking-tight select-none leading-none">
            Thought for {durationSeconds}s
          </span>
        )}

        {/* Chevron Indicator */}
        <span
          className={`material-symbols-outlined text-[15px] leading-none transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isExpanded ? 'rotate-90' : 'rotate-0'
          }`}
          style={{
            color: isThinking ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)',
          }}
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
            className="rounded-[14px] glass-card border border-white/25 px-3.5 py-2.5 max-w-full text-[12px] font-['Geist'] text-white leading-relaxed tracking-tight select-text shadow-md font-medium"
            style={{
              boxShadow:
                '0 4px 16px rgba(0, 0, 0, 0.2), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.35)',
            }}
          >
            {thoughtText || 'The user has requested me to finish the given task, analyzing requirements...'}
          </div>
        </div>
      </div>
    </div>
  );
};

export const ThinkingBlock = React.memo(ThinkingBlockImpl);
ThinkingBlock.displayName = 'ThinkingBlock';

export default ThinkingBlock;
