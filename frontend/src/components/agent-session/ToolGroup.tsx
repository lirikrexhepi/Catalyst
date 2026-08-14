import React, { useState } from 'react';

export interface ToolGroupItem {
  id?: string;
  type: 'read' | 'bash' | 'search' | 'edit' | 'write' | 'generic';
  action: string; // e.g. 'Read', 'Ran command', 'Searched', 'Edited'
  target: string; // e.g. 'composable/Test.tsx', 'npm run build'
  details?: string;
}

export interface ToolGroupProps {
  title?: string;
  summary?: string; // e.g. '10 files, 12 searches, 20 commands'
  items: ToolGroupItem[];
  defaultExpanded?: boolean;
  className?: string;
}

/**
 * ToolGroup Component
 * Accordion container grouping multiple atomic tool executions.
 * - Header: "Task completed  10 files, 12 searches, 20 commands v"
 * - Sub-items with Material Symbols icons
 */
const ToolGroupImpl: React.FC<ToolGroupProps> = ({
  title = 'Task completed',
  summary = '10 files, 12 searches, 20 commands',
  items = [],
  defaultExpanded = true,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const getIcon = (type: ToolGroupItem['type']) => {
    switch (type) {
      case 'read':
        return 'visibility';
      case 'bash':
        return 'terminal';
      case 'search':
        return 'search';
      case 'edit':
        return 'edit_note';
      case 'write':
        return 'description';
      default:
        return 'build';
    }
  };

  return (
    <div className={`flex flex-col gap-1.5 select-none font-['Geist'] ${className}`}>
      {/* Header Accordion Button */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="inline-flex items-center gap-2 px-2 py-0.5 rounded-[6px] hover:bg-white/10 active:scale-95 transition-all duration-150 cursor-pointer self-start group text-left"
      >
        <span className="text-[12px] font-medium text-white tracking-tight leading-none">
          {title}
        </span>
        {summary && (
          <span className="text-[12px] text-white/50 tracking-tight leading-none">
            {summary}
          </span>
        )}

        {/* Chevron Indicator */}
        <span
          className={`material-symbols-outlined text-[15px] text-white/60 group-hover:text-white leading-none transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            isExpanded ? 'rotate-180' : 'rotate-0'
          }`}
        >
          expand_more
        </span>
      </button>

      {/* Expanded List Container */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-220 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{
          gridTemplateRows: isExpanded ? '1fr' : '0fr',
          opacity: isExpanded ? 1 : 0,
          pointerEvents: isExpanded ? 'auto' : 'none',
        }}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-1.5 pl-2 pt-1 pb-0.5">
            {items.map((item, idx) => (
              <div
                key={item.id || idx}
                className="flex items-center gap-2.5 text-[12px] text-white/90 group/row"
              >
                {/* Icon */}
                <span className="material-symbols-outlined text-[16px] text-white/80 shrink-0 leading-none">
                  {getIcon(item.type)}
                </span>

                {/* Action label */}
                <span className="text-white/90 font-medium tracking-tight shrink-0">
                  {item.action}
                </span>

                {/* Target details */}
                <span className="text-white/45 font-normal tracking-tight truncate select-text">
                  {item.target}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export const ToolGroup = React.memo(ToolGroupImpl);
ToolGroup.displayName = 'ToolGroup';

export default ToolGroup;
