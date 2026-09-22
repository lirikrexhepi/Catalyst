import React, { useState } from 'react';
import { fileIconForPath } from '../common/fileIcon';

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
    ? (query ? `Searching for "${query}"...` : `Searching for relevant files...`)
    : summary || (query
        ? `Found ${fileCount} relevant ${fileCount === 1 ? 'file' : 'files'} for "${query}"`
        : `Found ${fileCount} relevant ${fileCount === 1 ? 'file' : 'files'}`);

  return (
    <div className={`flex flex-col gap-1.5 select-none font-['Geist'] ${className}`}>
      {/* Trigger Header Row */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] hover:bg-current/10 active:scale-95 transition-all duration-150 cursor-pointer self-start group"
      >
        <span className="text-[12px] font-medium text-current tracking-tight leading-none">
          {headerText}
        </span>

        {/* Chevron Indicator */}
        <span
          className={`material-symbols-outlined text-[15px] text-current/60 group-hover:text-current leading-none transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
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
            className="rounded-xl bg-current/[0.05] p-2.5 max-w-full flex flex-col gap-1 border-0 shadow-none"
          >
            {files.map((file, idx) => {
              const fileIcon = fileIconForPath(file);
              return (
              <div
                key={`${file}-${idx}`}
                onClick={() => onFileClick?.(file)}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-[8px] hover:bg-current/15 active:scale-[0.99] transition-colors duration-150 cursor-pointer group/item"
              >
                <img
                  src={fileIcon}
                  alt=""
                  draggable={false}
                  className="w-[18px] h-[18px] shrink-0"
                />

                <span className="text-[12px] font-medium text-current tracking-tight select-text truncate">
                  {file}
                </span>
              </div>
              );
            })}

            {files.length === 0 && !isSearching && (
              <div className="px-2 py-1.5 text-[12px] text-current/60">
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
