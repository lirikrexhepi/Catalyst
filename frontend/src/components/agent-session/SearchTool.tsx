import React, { useState } from 'react';

export interface SearchToolProps {
  files: string[];
  query?: string;
  summary?: string;
  isSearching?: boolean;
  className?: string;
  defaultExpanded?: boolean;
  onFileClick?: (path: string) => void;
}

/**
 * Search Tool / Relevant Files Component
 * - Header: "Found X relevant files v" (12px Geist font)
 * - Frosted White Glass Bubble: rounded-[14px], translucent white glass with light transmission
 * - Icon: cards_stack (Material Symbols)
 */
const SearchToolImpl: React.FC<SearchToolProps> = ({
  files = [],
  query,
  summary,
  isSearching = false,
  className = '',
  defaultExpanded = false,
  onFileClick,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const fileCount = files.length;
  const headerText = isSearching
    ? `Searching for relevant files...`
    : summary || `Found ${fileCount} relevant ${fileCount === 1 ? 'file' : 'files'}`;

  return (
    <div className={`flex flex-col gap-1.5 select-none font-['Geist'] ${className}`}>
      {/* Trigger Header Row */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] hover:bg-white/10 active:scale-95 transition-all duration-150 cursor-pointer self-start group"
      >
        <span className="text-[12px] font-medium text-white tracking-tight leading-none">
          {headerText}
        </span>

        {/* Chevron Indicator */}
        <span
          className={`material-symbols-outlined text-[15px] text-white/60 group-hover:text-white leading-none transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isExpanded ? 'rotate-180' : 'rotate-0'
          }`}
        >
          expand_more
        </span>
      </button>

      {/* Collapsible Frosted White Glass Bubble */}
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
            className="rounded-[14px] glass-card border border-white/25 p-2.5 max-w-full flex flex-col gap-1 shadow-md"
            style={{
              boxShadow:
                '0 4px 16px rgba(0, 0, 0, 0.2), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.35)',
            }}
          >
            {files.map((file, idx) => (
              <div
                key={`${file}-${idx}`}
                onClick={() => onFileClick?.(file)}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-[8px] hover:bg-white/15 active:scale-[0.99] transition-colors duration-150 cursor-pointer group/item"
              >
                {/* Material Symbols cards_stack icon */}
                <span className="material-symbols-outlined text-[17px] text-white/90 group-hover/item:text-white shrink-0 leading-none">
                  cards_stack
                </span>

                {/* File Path in 12px Geist */}
                <span className="text-[12px] font-medium text-white tracking-tight select-text truncate">
                  {file}
                </span>
              </div>
            ))}

            {files.length === 0 && !isSearching && (
              <div className="px-2 py-1.5 text-[12px] text-white/60">
                No matching files found.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const SearchTool = React.memo(SearchToolImpl);
SearchTool.displayName = 'SearchTool';

export default SearchTool;
