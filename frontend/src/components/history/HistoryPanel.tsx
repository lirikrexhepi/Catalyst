import React from 'react';
import { LiquidGlass } from '../../liquid-glass';
import { ScrollArea } from '../common/ScrollArea';
import { history } from '../../../wailsjs/go/models';

export interface HistoryPanelProps {
  entries: history.Meta[];
  isLoading: boolean;
  error?: string | null;
  activeWorkspaceId?: string | null;
  /** True while agents are running, which a new chat would end. */
  hasLiveAgents?: boolean;
  onOpen: (workspaceId: string) => void;
  onDelete: (workspaceId: string) => void;
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
  meta: history.Meta;
  isActive: boolean;
  onOpen: (workspaceId: string) => void;
  onDelete: (workspaceId: string) => void;
}> = ({ meta, isActive, onOpen, onDelete }) => {
  const workspaceId = meta.workspace?.id ?? '';
  const agentCount = meta.tasks?.length ?? 0;

  return (
    <div
      onClick={() => onOpen(workspaceId)}
      className={`group flex items-start gap-2.5 p-2 rounded-[10px] border cursor-pointer transition-all duration-150 ${
        isActive
          ? 'bg-white/12 border-white/20'
          : 'bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.08]'
      }`}
    >
      <span className="material-symbols-rounded text-[16px] text-white/35 leading-none pt-0.5 shrink-0">
        forum
      </span>

      <div className="min-w-0 flex-1 flex flex-col gap-0.5">
        <span className="text-[12px] font-medium font-['Geist'] text-white/95 tracking-tight truncate">
          {meta.workspace?.title || 'Session'}
        </span>
        <span className="text-[10.5px] font-['Geist'] text-white/40 truncate">
          {/* The agent count is what distinguishes this from a single chat log. */}
          {agentCount} agent{agentCount === 1 ? '' : 's'}
          <span className="text-white/25"> · {relativeTime(meta.workspace?.updatedAt ?? 0)}</span>
        </span>
      </div>

      <button
        type="button"
        title="Delete session"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(workspaceId);
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
  hasLiveAgents = false,
  onOpen,
  onDelete,
  onNewChat,
  onRefresh,
  onClose,
  className = '',
}) => (
  <LiquidGlass
    variant="panel"
    surface="squircle"
    radius={20}
    bezelWidth={18}
    glassThickness={24}
    refractionScale={0.8}
    blur={0.4}
    specularOpacity={0.8}
    specularSaturation={6}
    lightAngle={-45}
    tint="rgba(0, 0, 0, 0.22)"
    shadow="apple"
    border="1px solid rgba(255, 255, 255, 0.18)"
    frost={16}
    frostSaturation={170}
    className={`w-[340px] flex flex-col ${className}`}
    style={{
      boxShadow:
        '0 20px 54px rgba(0, 0, 0, 0.55), 0 4px 14px rgba(0, 0, 0, 0.35), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.25)',
    }}
  >
    <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 shrink-0">
      <div className="flex items-center gap-2">
        <span className="material-symbols-rounded text-[18px] text-white/80 leading-none">
          history
        </span>
        <span className="text-[13px] font-semibold font-['Geist'] text-white tracking-tight">
          History
        </span>
        {entries.length > 0 && (
          <span className="text-[11px] font-medium font-['Geist'] text-white/35 tabular-nums">
            {entries.length}
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

    {entries.length === 0 ? (
      <div className="px-4 pb-5 pt-1">
        <p className="text-[12px] font-['Geist'] text-white/45 leading-relaxed">
          {isLoading
            ? 'Loading…'
            : 'No past sessions yet. Delegating work saves the conversation and every agent it starts.'}
        </p>
      </div>
    ) : (
      <ScrollArea maxHeight={420} className="px-4 pb-4 flex flex-col gap-1.5">
        {entries.map((meta) => (
          <HistoryRow
            key={meta.workspace?.id}
            meta={meta}
            isActive={activeWorkspaceId === meta.workspace?.id}
            onOpen={onOpen}
            onDelete={onDelete}
          />
        ))}
      </ScrollArea>
    )}
  </LiquidGlass>
);

export default HistoryPanel;
