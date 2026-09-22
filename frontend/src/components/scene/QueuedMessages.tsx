import React, { useState } from 'react';
import { domain } from '../../../wailsjs/go/models';

export interface QueuedMessage {
  id: string;
  threadId: string;
  text: string;
  modelId: string;
  files?: domain.FileRef[];
  createdAt: number;
}

export interface QueuedMessagesProps {
  items: QueuedMessage[];
  onSendNow: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  className?: string;
}

/**
 * QueuedMessages Component
 * Displays messages queued while the agent is running, matching Antigravity's UI.
 * Allows quick inspection, editing, deletion, or immediate sending.
 */
export const QueuedMessages: React.FC<QueuedMessagesProps> = ({
  items,
  onSendNow,
  onEdit,
  onDelete,
  className = '',
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (items.length === 0) return null;

  return (
    <div
      className={`w-full max-w-[740px] rounded-[16px] glass-card border border-white/20 p-2.5 text-white font-['Geist'] select-none flex flex-col gap-1.5 transition-all duration-200 pointer-events-auto shadow-2xl ${className}`}
      style={{
        boxShadow:
          '0 12px 32px rgba(0, 0, 0, 0.45), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.35)',
        background: 'rgba(15, 18, 28, 0.85)',
      }}
    >
      {/* Header Row: Title + Count Badge + Subtitle + Collapse Toggle */}
      <div className="flex items-center justify-between px-1.5 py-0.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[12px] font-semibold text-white tracking-tight shrink-0">
            Queued Messages
          </span>
          <span className="px-1.5 py-[1px] rounded-full bg-white/20 text-white font-bold text-[10.5px] leading-tight shrink-0">
            {items.length}
          </span>
          <span className="text-[11px] text-white/50 tracking-tight truncate hidden sm:inline">
            Sends after agent finishes working
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          title={isCollapsed ? 'Expand queue' : 'Collapse queue'}
          className="w-[22px] h-[22px] rounded-[6px] flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 active:scale-90 transition-all cursor-pointer shrink-0"
        >
          <span className="material-symbols-outlined text-[16px] leading-none">
            {isCollapsed ? 'expand_more' : 'expand_less'}
          </span>
        </button>
      </div>

      {/* Queued List */}
      {!isCollapsed && (
        <div className="flex flex-col gap-1.5 max-h-[140px] overflow-y-auto custom-scrollbar pr-0.5">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-[10px] bg-white/[0.06] border border-white/10 hover:bg-white/[0.10] transition-all group"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span className="text-[10px] text-white/40 font-mono shrink-0">
                  #{index + 1}
                </span>
                <span className="text-[12px] text-white/95 tracking-tight truncate flex-1 font-medium">
                  {item.text || (item.files?.length ? `${item.files.length} attached file(s)` : 'Empty prompt')}
                </span>
                {item.files && item.files.length > 0 && (
                  <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/10 text-[10px] text-white/75 shrink-0">
                    <span className="material-symbols-rounded text-[11px] leading-none">
                      attach_file
                    </span>
                    {item.files.length}
                  </span>
                )}
              </div>

              {/* Action Buttons: Send Now, Edit, Delete */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onSendNow(item.id)}
                  title="Send now"
                  className="w-[24px] h-[24px] rounded-[7px] flex items-center justify-center text-white/60 hover:text-white hover:bg-white/15 active:scale-90 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px] leading-none">
                    arrow_forward
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(item.id)}
                  title="Edit message"
                  className="w-[24px] h-[24px] rounded-[7px] flex items-center justify-center text-white/60 hover:text-white hover:bg-white/15 active:scale-90 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px] leading-none">
                    edit
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  title="Delete message"
                  className="w-[24px] h-[24px] rounded-[7px] flex items-center justify-center text-white/40 hover:text-rose-300 hover:bg-rose-500/20 active:scale-90 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[15px] leading-none">
                    delete
                  </span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default QueuedMessages;
