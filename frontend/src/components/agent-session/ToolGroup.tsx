import React, { useEffect, useRef, useState } from 'react';

export interface ToolGroupItem {
  id?: string;
  type: 'read' | 'bash' | 'search' | 'edit' | 'write' | 'git' | 'generic';
  action: string; // e.g. 'Read', 'Ran command', 'Searched', 'Edited', 'Git'
  target: string; // e.g. 'composable/Test.tsx', 'git status', 'npm run build'
  details?: string;
  status?: 'running' | 'completed' | 'error';
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
 * Zeron-style activity block: "Worked  3 files, 2 commands" header with live
 * running pulse, auto-expanding while work streams, per-tool rows with
 * file-type badges and mono targets.
 */
function firstLine(text: string): string {
  const line = text.split('\n').find((candidate) => candidate.trim());
  return line ? line.trim() : '';
}

/** Extension badge for file rows, e.g. rs / tsx / md. */
function fileExtOf(target: string): string | null {
  const base = (target.split(/[\\/]/).pop() || '').split(':')[0];
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return null;
  const ext = base.slice(dot + 1).toLowerCase();
  return ext.length <= 5 ? ext : null;
}

/** Splits a path into muted dir prefix + file name, like Zeron rows. */
function splitTarget(target: string): { dir: string; base: string } {
  const parts = target.split(/[\\/]/);
  if (parts.length <= 1) return { dir: '', base: target };
  return { dir: parts.slice(0, -1).join('/') + '/', base: parts[parts.length - 1] };
}

function FileBadge({ ext }: { ext: string }) {
  return (
    <span className="w-[22px] h-[22px] rounded-[6px] bg-current/[0.07] flex items-center justify-center shrink-0">
      <span className="font-mono text-[8.5px] font-semibold text-current/60 leading-none tracking-tight">
        {ext.slice(0, 4)}
      </span>
    </span>
  );
}

function RowIcon({ type }: { type: ToolGroupItem['type'] }) {
  const symbol =
    type === 'bash'
      ? 'terminal'
      : type === 'search'
        ? 'search'
        : type === 'git'
          ? 'account_tree'
          : type === 'edit'
            ? 'edit_note'
            : type === 'write'
              ? 'description'
              : 'build';
  return (
    <span className="w-[22px] h-[22px] rounded-[6px] bg-current/[0.07] flex items-center justify-center shrink-0">
      <span className="material-symbols-outlined text-[13px] text-current/65 leading-none">
        {symbol}
      </span>
    </span>
  );
}

const ToolGroupImpl: React.FC<ToolGroupProps> = ({
  title = 'Tools',
  summary,
  items = [],
  defaultExpanded = false,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [expandedItems, setExpandedItems] = useState<Record<string | number, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | number | null>(null);

  const anyRunning = items.some((item) => item.status === 'running');
  const wasRunning = useRef(false);
  // Auto-expand when fresh activity streams in, like Zeron's live feed. Once
  // settled, the user's own toggle wins until the next run starts.
  useEffect(() => {
    if (anyRunning && !wasRunning.current) setIsExpanded(true);
    wasRunning.current = anyRunning;
  }, [anyRunning]);

  const toggleItem = (key: string | number) => {
    setExpandedItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCopy = (e: React.MouseEvent, key: string | number, text: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const getIcon = (type: ToolGroupItem['type']) => {
    switch (type) {
      case 'git':
        return 'account_tree';
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
  void getIcon;

  return (
    <div className={`flex flex-col gap-1.5 select-none font-['Geist'] ${className}`}>
      {/* Header Accordion Button */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="inline-flex items-center gap-2 px-2 py-0.5 rounded-[6px] hover:bg-current/[0.06] active:scale-95 transition-all duration-150 cursor-pointer self-start group text-left"
      >
        {anyRunning && (
          <span className="w-1.5 h-1.5 rounded-full bg-current/80 shrink-0 status-dot-working" />
        )}
        <span className="text-[12px] font-medium text-current tracking-tight leading-none">
          {title}
        </span>
        {summary && (
          <span className="text-[12px] text-current/50 tracking-tight leading-none truncate max-w-[340px]">
            {summary}
          </span>
        )}

        {/* Chevron Indicator */}
        <span
          className={`material-symbols-outlined text-[15px] text-current/60 group-hover:text-current leading-none transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
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
            {items.map((item, idx) => {
              const itemKey = item.id || idx;
              const hasDetails = Boolean(item.details && item.details.trim());
              const isItemExpanded = Boolean(expandedItems[itemKey]);
              const ext = fileExtOf(item.target);
              const showBadge = ext !== null && (item.type === 'read' || item.type === 'edit' || item.type === 'write');
              const { dir, base } = splitTarget(item.target);

              return (
                <div key={itemKey} className="flex flex-col">
                  <div
                    onClick={() => hasDetails && toggleItem(itemKey)}
                    className={`flex items-center gap-2 text-[12px] text-current/90 group/row py-[3px] px-1.5 -mx-1.5 rounded-[6px] transition-colors ${
                      hasDetails ? 'cursor-pointer hover:bg-current/[0.06]' : ''
                    }`}
                  >
                    {/* Icon box: file badge for file rows, symbol box otherwise */}
                    {item.status === 'error' ? (
                      <span className="w-[22px] h-[22px] rounded-[6px] bg-current/[0.07] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[13px] text-red-400/90 leading-none">
                          error
                        </span>
                      </span>
                    ) : showBadge ? (
                      <FileBadge ext={ext as string} />
                    ) : (
                      <RowIcon type={item.type} />
                    )}

                    {/* Action label */}
                    <span
                      className={`font-medium tracking-tight shrink-0 ${
                        item.status === 'error' ? 'text-red-400/90' : 'text-current/90'
                      }`}
                    >
                      {item.action}
                    </span>

                    {/* Target: muted dir + file name, mono like Zeron rows */}
                    <span className="font-normal tracking-tight truncate select-text min-w-0 flex-1 font-mono text-[11.5px]">
                      {dir && <span className="text-current/35">{dir}</span>}
                      <span className="text-current/60">{base}</span>
                    </span>

                    {item.status === 'running' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-current/70 shrink-0 status-dot-working ml-auto" />
                    )}

                    {/* Expandable indicator for details */}
                    {hasDetails && (
                      <span
                        className={`material-symbols-outlined text-[14px] text-current/40 group-hover/row:text-current/80 shrink-0 leading-none transition-transform duration-150 ${
                          isItemExpanded ? 'rotate-180 text-current/80' : 'rotate-0'
                        }`}
                      >
                        expand_more
                      </span>
                    )}
                  </div>

                  {/* Expanded Details / Output */}
                  {isItemExpanded && hasDetails && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="my-1 ml-6 mr-1 p-2 rounded-[8px] bg-current/[0.04] border border-current/10 text-current/85 text-[11px] select-text shadow-sm"
                    >
                      <div className="flex items-center justify-between pb-1 mb-1 border-b border-current/10 text-current/45 text-[10px] tracking-tight">
                        <span className="truncate pr-2">{item.target || item.action}</span>
                        <button
                          type="button"
                          onClick={(e) => handleCopy(e, itemKey, item.details!)}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-current/10 text-current/70 hover:text-current transition-all active:scale-95 cursor-pointer shrink-0"
                          title="Copy output"
                        >
                          <span className="material-symbols-outlined text-[12px] leading-none">
                            {copiedKey === itemKey ? 'check' : 'content_copy'}
                          </span>
                          <span>{copiedKey === itemKey ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <pre className="whitespace-pre-wrap break-all overflow-x-auto max-h-[260px] custom-scrollbar m-0 leading-relaxed font-['Geist_Mono',monospace] text-current/80">
                        {item.details}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export const ToolGroup = React.memo(ToolGroupImpl);
ToolGroup.displayName = 'ToolGroup';

export default ToolGroup;
