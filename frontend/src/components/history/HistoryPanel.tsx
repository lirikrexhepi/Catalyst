import React, { useMemo } from 'react';
import { ScrollArea } from '../common/ScrollArea';
import { history } from '../../../wailsjs/go/models';
import {
  extractChatHistoryItems,
  groupChatHistoryItems,
  ChatHistoryItem,
  renderOverlappingChatIcons,
  formatChatSubtitle,
} from '../common/DynamicIsland';

export interface HistoryPanelProps {
  entries: history.Meta[];
  isLoading: boolean;
  error?: string | null;
  activeWorkspaceId?: string | null;
  activeThreadId?: string | null;
  activeTasks?: Array<{ threadId: string; isBusy?: boolean }>;
  /** True while agents are running, which a new chat would end. */
  hasLiveAgents?: boolean;
  liveTaskCount?: number;
  onOpen: (workspaceId: string, threadId?: string) => void;
  onDelete: (workspaceId: string, threadId?: string) => void;
  onNewChat: () => void;
  onRefresh: () => void;
  onClose: () => void;
  className?: string;
}

/** Relative time, since the exact minute of a past session is rarely useful. */
function relativeTime(at: number): string {
  if (!at) return '';
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(at).toLocaleDateString();
}

const HistoryRow: React.FC<{
  chat: ChatHistoryItem;
  isActive: boolean;
  isBusy?: boolean;
  onOpen: (workspaceId: string, threadId?: string) => void;
  onDelete: (workspaceId: string, threadId?: string) => void;
}> = ({ chat, isBusy, onOpen, onDelete }) => {
  return (
    <div
      onClick={() => onOpen(chat.workspaceId, chat.threadId)}
      className={`group flex items-start gap-2.5 p-2 rounded-[10px] border cursor-pointer transition-all duration-150 ${
        isBusy
          ? 'bg-emerald-500/[0.14] border-emerald-400/40 hover:bg-emerald-500/[0.18]'
          : 'bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.08]'
      }`}
    >
      <div className="pt-0.5 shrink-0 flex items-center">
        {renderOverlappingChatIcons(chat, false)}
      </div>

      <div className="min-w-0 flex-1 flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[12px] font-medium font-['Geist'] text-white/95 tracking-tight truncate">
            {chat.title}
          </span>
          {isBusy && (
            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-semibold bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 shrink-0 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Running
            </span>
          )}
        </div>
        <span className="text-[10.5px] font-['Geist'] text-white/40 truncate">
          {formatChatSubtitle(chat)}
        </span>
      </div>

      <button
        type="button"
        title="Delete chat"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(chat.workspaceId, chat.threadId);
        }}
        className="w-[22px] h-[22px] rounded-[6px] grid place-items-center opacity-0 group-hover:opacity-100 text-white/40 hover:text-rose-200 hover:bg-rose-500/20 active:scale-90 transition-all shrink-0 cursor-pointer"
      >
        <span className="material-symbols-rounded text-[14px] leading-none">delete</span>
      </button>
    </div>
  );
};

export const HistoryPanel: React.FC<HistoryPanelProps> = ({
  entries,
  isLoading,
  error,
  activeWorkspaceId,
  activeThreadId,
  activeTasks = [],
  hasLiveAgents = false,
  liveTaskCount = 0,
  onOpen,
  onDelete,
  onNewChat,
  onRefresh,
  onClose,
  className = '',
}) => {
  const chatItems = useMemo(() => extractChatHistoryItems(entries), [entries]);
  const groupedItems = useMemo(() => groupChatHistoryItems(chatItems), [chatItems]);

  return (
    <div className={`w-full h-full flex flex-col select-none ${className}`}>
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <span className="material-symbols-rounded text-[18px] text-white/80 leading-none">
            history
          </span>
          <span className="text-[13px] font-semibold font-['Geist'] text-white tracking-tight">
            History
          </span>
          {chatItems.length > 0 && (
            <span className="text-[11px] font-medium font-['Geist'] text-white/35 tabular-nums">
              {chatItems.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title={
              hasLiveAgents
                ? 'New chat — stops the running agents'
                : 'New chat with the orchestrator'
            }
            onClick={onNewChat}
            className="w-[24px] h-[24px] rounded-[7px] hover:bg-white/10 active:scale-90 flex items-center justify-center transition-all duration-150 cursor-pointer text-white/45 hover:text-white/90"
          >
            <span className="material-symbols-rounded text-[17px] leading-none">add</span>
          </button>
          <button
            type="button"
            title="Refresh"
            onClick={onRefresh}
            className="w-[24px] h-[24px] rounded-[7px] hover:bg-white/10 active:scale-90 flex items-center justify-center transition-all duration-150 cursor-pointer text-white/45 hover:text-white/90"
          >
            <span className="material-symbols-rounded text-[16px] leading-none">refresh</span>
          </button>
          <button
            type="button"
            title="Close"
            onClick={onClose}
            className="w-[24px] h-[24px] rounded-[7px] hover:bg-white/10 active:scale-90 flex items-center justify-center transition-all duration-150 cursor-pointer text-white/45 hover:text-white/90"
          >
            <span className="material-symbols-rounded text-[16px] leading-none">close</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mb-2.5 px-3 py-2 rounded-[9px] bg-red-500/10 border border-red-400/25">
          <span className="text-[11px] font-medium font-['Geist'] text-red-200/90 leading-relaxed">
            {error}
          </span>
        </div>
      )}

      {hasLiveAgents && liveTaskCount > 0 && (
        <div
          onClick={() => onOpen(activeWorkspaceId || '')}
          className="mx-4 mb-2.5 p-2.5 rounded-[12px] bg-emerald-500/[0.14] border border-emerald-400/35 cursor-pointer hover:bg-emerald-500/[0.20] active:scale-[0.99] transition-all flex items-center justify-between group shadow-[0_2px_12px_rgba(16,185,129,0.12)]"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,1)] animate-pulse shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-[12px] font-semibold text-emerald-100 truncate tracking-tight">
                Current Live Session
              </span>
              <span className="text-[10px] text-emerald-300/75">
                {liveTaskCount} active agent{liveTaskCount === 1 ? '' : 's'} · Focus deck
              </span>
            </div>
          </div>
          <span className="text-[9.5px] font-semibold font-['Geist'] text-emerald-300 bg-emerald-500/25 px-2 py-0.5 rounded-full border border-emerald-500/40 shrink-0">
            Live Now
          </span>
        </div>
      )}

      {chatItems.length === 0 ? (
        <div className="px-4 pb-5 pt-1">
          <p className="text-[12px] font-['Geist'] text-white/45 leading-relaxed">
            {isLoading
              ? 'Loading…'
              : 'No past sessions yet. Delegating work saves the conversation and every agent it starts.'}
          </p>
        </div>
      ) : (
        <ScrollArea maxHeight={420} className="px-4 pb-4 flex flex-col gap-3">
          {groupedItems.map((group) => (
            <div key={group.label} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between px-1 pt-1 pb-0.5 select-none">
                <span className="text-[10px] font-semibold tracking-wider uppercase font-['Geist'] text-white/40">
                  {group.label}
                </span>
                <span className="text-[9.5px] font-mono tabular-nums text-white/30">
                  {group.chats.length}
                </span>
              </div>
              {group.chats.map((chat) => {
                const isBusy = activeTasks?.some(
                  (t) =>
                    (t.threadId === chat.threadId ||
                      (chat.threadId && t.threadId.startsWith(chat.threadId))) &&
                    t.isBusy,
                );

                return (
                  <HistoryRow
                    key={chat.id}
                    chat={chat}
                    isActive={activeThreadId === chat.threadId || activeWorkspaceId === chat.workspaceId}
                    isBusy={isBusy}
                    onOpen={onOpen}
                    onDelete={onDelete}
                  />
                );
              })}
            </div>
          ))}
        </ScrollArea>
      )}
    </div>
  );
};

export default HistoryPanel;
