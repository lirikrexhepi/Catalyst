import React, { useState } from 'react';
import { fileIconForPath } from '../common/fileIcon';

export interface DiffLine {
  type: 'add' | 'delete' | 'context';
  lineNum: number;
  content: string;
}

export interface EditToolProps {
  filePath: string;
  additions?: number;
  deletions?: number;
  diffLines?: DiffLine[];
  className?: string;
  defaultExpanded?: boolean;
  /** Tool that produced the change (Write reads as "Wrote"). */
  toolName?: string;
  status?: 'running' | 'completed' | 'error';
}

/**
 * EditTool Component
 * Diff viewer card for code modifications matching the exact compact height of BashTool.
 */
const EditToolImpl: React.FC<EditToolProps> = ({
  filePath,
  additions = 0,
  deletions = 0,
  diffLines = [],
  className = '',
  defaultExpanded = false,
  toolName,
  status,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isCopied, setIsCopied] = useState(false);
  const fileIcon = fileIconForPath(filePath);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = diffLines
      .map((l) => `${l.type === 'add' ? '+' : l.type === 'delete' ? '-' : ' '} ${l.content}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 1500);
  };

  return (
    <div
      className={`rounded-xl bg-current/[0.05] px-3.5 py-2.5 text-current max-w-full transition-all duration-150 group select-none font-['Geist'] border-0 shadow-none ${className}`}
    >
      {/* Header Row - Exact same 22px height & alignment as BashTool */}
      <div
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex items-center justify-between cursor-pointer gap-2 h-[22px]"
      >
        <div className="flex items-center gap-2 min-w-0 h-full">
          <img
            src={fileIcon}
            alt=""
            draggable={false}
            className="w-[18px] h-[18px] shrink-0"
          />

          <span className="text-[12px] font-medium text-current tracking-tight truncate leading-none flex items-center">
            {editVerb(toolName, status)} {filePath}
          </span>
        </div>

        {/* Right Stats & Controls */}
        <div className="flex items-center gap-1.5 opacity-70 group-hover:opacity-100 transition-opacity shrink-0 h-full">
          {/* Diff stats (+N -N) */}
          <div className="flex items-center gap-1 text-[11px] font-mono leading-none mr-0.5">
            <span className="text-emerald-400 font-semibold">+{additions}</span>
            <span className="text-rose-400 font-semibold">-{deletions}</span>
          </div>

          {/* Copy Button */}
          <button
            type="button"
            title="Copy diff"
            onClick={handleCopy}
            className="w-[20px] h-[20px] rounded flex items-center justify-center hover:bg-current/15 active:scale-90 transition-all text-current/80 hover:text-current cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-[13px] leading-none flex items-center justify-center">
              {isCopied ? 'check' : 'content_copy'}
            </span>
          </button>

          {/* Chevron */}
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

      {/* Collapsible Diff Body */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{
          gridTemplateRows: isExpanded ? '1fr' : '0fr',
          opacity: isExpanded ? 1 : 0,
        }}
      >
        <div className="overflow-hidden">
          <div className="pt-2 flex flex-col font-['Geist'] text-[12px] select-text overflow-x-auto max-h-[260px] custom-scrollbar rounded-[8px]">
            {diffLines.map((line, idx) => {
              const isAdd = line.type === 'add';
              const isDel = line.type === 'delete';

              return (
                <div
                  key={idx}
                  className={`flex items-stretch px-2 py-0.5 min-w-full font-mono text-[11px] leading-[18px] ${
                    isAdd
                      ? 'bg-emerald-500/15 text-emerald-200'
                      : isDel
                      ? 'bg-rose-500/15 text-rose-200'
                      : 'text-current/70'
                  }`}
                >
                  {/* Line Number */}
                  <span className="w-6 text-right pr-3 select-none text-current/35 shrink-0 font-mono text-[10px]">
                    {line.lineNum}
                  </span>

                  {/* Indicator bar */}
                  <span
                    className={`w-1 select-none mr-2 shrink-0 ${
                      isAdd
                        ? 'bg-emerald-400/80'
                        : isDel
                        ? 'bg-rose-400/80'
                        : 'bg-transparent'
                    }`}
                  />

                  {/* Content line */}
                  <span className="font-mono text-[11px] whitespace-pre">
                    {line.content}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

function editVerb(toolName?: string, status?: string): string {
  const write = /^(write|write_to_file|writefile|create)$/i.test(toolName || '');
  if (status === 'running') return write ? 'Writing' : 'Editing';
  if (status === 'error') return write ? 'Failed to write' : 'Failed to edit';
  return write ? 'Wrote' : 'Edited';
}

export const EditTool = React.memo(EditToolImpl);
EditTool.displayName = 'EditTool';

export default EditTool;
