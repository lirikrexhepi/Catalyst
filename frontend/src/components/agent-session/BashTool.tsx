import React, { useState } from 'react';

export interface BashToolProps {
  command: string;
  output?: string;
  summary?: string;
  status?: 'running' | 'completed' | 'error';
  exitCode?: number;
  className?: string;
  defaultExpanded?: boolean;
}

/**
 * Bash Command Tool Component
 * - Frosted Translucent White Glass Bubble matching Image 2
 * - 14px rounded corners
 * - 12px Geist typography
 */
const BashToolImpl: React.FC<BashToolProps> = ({
  command,
  output = '',
  summary,
  status = 'completed',
  exitCode,
  className = '',
  defaultExpanded = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isCopied, setIsCopied] = useState(false);

  const commandSummary = summary || command.split(' ')[0] || 'command';

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(command);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 1500);
  };

  return (
    <div
      className={`rounded-[14px] glass-card border border-white/25 px-3.5 py-2.5 text-white max-w-full shadow-md transition-all duration-150 group select-none font-['Geist'] ${className}`}
      style={{
        boxShadow:
          '0 4px 16px rgba(0, 0, 0, 0.2), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.35)',
      }}
    >
      {/* Header Row - Centered vertically */}
      <div
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex items-center justify-between cursor-pointer gap-2 h-[22px]"
      >
        <div className="flex items-center gap-2 min-w-0 h-full">
          {/* Material Symbols terminal_add icon */}
          <span className="material-symbols-outlined text-[17px] text-white/95 shrink-0 w-[18px] h-[18px] flex items-center justify-center leading-none">
            terminal_add
          </span>

          <span className="text-[12px] font-medium font-['Geist'] text-white tracking-tight truncate leading-none flex items-center">
            {status === 'running' ? `Running command: ${commandSummary}` : `Ran command: ${commandSummary}`}
          </span>

          {/* Running Indicator */}
          {status === 'running' && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse ml-0.5 shrink-0" />
          )}

          {/* Error Exit Code Pill */}
          {status === 'error' && exitCode !== undefined && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/25 text-rose-200 border border-rose-500/40 shrink-0 font-['Geist'] leading-none">
              exit {exitCode}
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity shrink-0 h-full">
          {/* Copy Command Button */}
          <button
            type="button"
            title="Copy command"
            onClick={handleCopy}
            className="w-[20px] h-[20px] rounded flex items-center justify-center hover:bg-white/15 active:scale-90 transition-all text-white/80 hover:text-white cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-[13px] leading-none flex items-center justify-center">
              {isCopied ? 'check' : 'content_copy'}
            </span>
          </button>

          {/* Accordion Chevron */}
          <button
            type="button"
            className="w-[20px] h-[20px] rounded flex items-center justify-center hover:bg-white/15 text-white/80 hover:text-white shrink-0 cursor-pointer"
          >
            <span
              className={`material-symbols-outlined text-[15px] leading-none flex items-center justify-center transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                isExpanded ? 'rotate-180' : 'rotate-0'
              }`}
            >
              expand_more
            </span>
          </button>
        </div>
      </div>

      {/* Collapsible Command & Output Body */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{
          gridTemplateRows: isExpanded ? '1fr' : '0fr',
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div className="overflow-hidden">
          <div className="pt-2 flex flex-col gap-1 font-['Geist'] text-[12px]">
            {/* Full command invocation */}
            <div className="text-white font-medium select-text leading-relaxed tracking-tight">
              {command}
            </div>

            {/* Output lines */}
            {output && (
              <pre className="text-white/85 font-['Geist'] text-[12px] whitespace-pre-wrap select-text leading-relaxed p-0 m-0 overflow-x-auto max-h-[220px] custom-scrollbar">
                {output}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const BashTool = React.memo(BashToolImpl);
BashTool.displayName = 'BashTool';

export default BashTool;
