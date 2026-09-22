import React, { useState } from 'react';
import { OrbitLoader } from './OrbitLoader';

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

  const commandSummary = summary || (command.length > 60 ? `${command.slice(0, 60)}…` : command) || 'command';

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(command);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 1500);
  };

  return (
    <div
      className={`rounded-xl bg-current/[0.05] px-3.5 py-2.5 text-current max-w-full transition-all duration-150 group select-none font-['Geist'] border-0 shadow-none ${className}`}
    >
      {/* Header Row - Centered vertically */}
      <div
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex items-center justify-between cursor-pointer gap-2 h-[22px]"
      >
        <div className="flex items-center gap-2 min-w-0 h-full">
          {/* Material Symbols terminal_add icon */}
          <span className="material-symbols-outlined text-[17px] text-current/95 shrink-0 w-[18px] h-[18px] flex items-center justify-center leading-none">
            terminal_add
          </span>

          <span className="text-[12px] font-medium font-['Geist'] text-current tracking-tight truncate leading-none flex items-center">
            {status === 'running' ? `Running command: ${commandSummary}` : `Ran command: ${commandSummary}`}
          </span>

          {status === 'running' && (
            <OrbitLoader size={12} className="ml-0.5 shrink-0" />
          )}

          {status === 'error' && exitCode !== undefined && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-200 shrink-0 font-['Geist'] leading-none">
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
            className="w-[20px] h-[20px] rounded flex items-center justify-center hover:bg-current/15 active:scale-90 transition-all text-current/80 hover:text-current cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-[13px] leading-none flex items-center justify-center">
              {isCopied ? 'check' : 'content_copy'}
            </span>
          </button>

          {/* Accordion Chevron */}
          <button
            type="button"
            className="w-[20px] h-[20px] rounded flex items-center justify-center hover:bg-current/15 text-current/80 hover:text-current shrink-0 cursor-pointer"
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
          <div className="pt-2">
            <div className="rounded-lg bg-black/45 px-3 py-2.5 font-mono text-[11.5px] leading-relaxed overflow-x-auto max-h-[220px] custom-scrollbar select-text">
              <div className="flex items-start gap-1.5">
                <span className="text-emerald-400 shrink-0 select-none">❯</span>
                <span className="text-current/95 whitespace-pre-wrap break-all">{command}</span>
              </div>
              {output && (
                <pre className="text-current/70 whitespace-pre-wrap m-0 mt-1 overflow-visible">
                  {output}
                </pre>
              )}
              {status === 'running' && (
                <span className="inline-block w-[7px] h-[14px] bg-emerald-400/80 mt-1 animate-pulse" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const BashTool = React.memo(BashToolImpl);
BashTool.displayName = 'BashTool';

export default BashTool;
