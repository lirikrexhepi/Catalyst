import React, { useEffect, useMemo, useState } from 'react';
import { ScrollArea } from '../common/ScrollArea';
import { claudeimport } from '../../../wailsjs/go/models';

export interface ImportClaudeDialogProps {
  sessions: claudeimport.ExternalSession[];
  isLoading: boolean;
  isImporting: boolean;
  error?: string | null;
  onRefresh: () => void;
  onImport: (filePath: string) => void;
  onClose: () => void;
}

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

function shortCwd(cwd: string): string {
  if (!cwd) return '';
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length <= 2) return cwd;
  return `…/${parts.slice(-2).join('/')}`;
}

export const ImportClaudeDialog: React.FC<ImportClaudeDialogProps> = ({
  sessions,
  isLoading,
  isImporting,
  error,
  onRefresh,
  onImport,
  onClose,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    onRefresh();
  }, [onRefresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.cwd || '').toLowerCase().includes(q) ||
        (s.preview || '').toLowerCase().includes(q),
    );
  }, [sessions, query]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[520px] max-h-[70vh] flex flex-col rounded-[18px] border border-white/[0.12] bg-[#14161c]/95 shadow-[0_24px_64px_rgba(0,0,0,0.6)] select-none"
      >
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-rounded text-[18px] text-white/80 leading-none">
              upload
            </span>
            <span className="text-[13px] font-semibold font-['Geist'] text-white tracking-tight">
              Import Claude Code chat
            </span>
            {sessions.length > 0 && (
              <span className="text-[11px] font-medium font-['Geist'] text-white/35 tabular-nums">
                {filtered.length}/{sessions.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
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

        <div className="px-4 pb-2 shrink-0">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title or folder…"
            className="w-full h-[30px] px-3 rounded-[9px] bg-white/[0.06] border border-white/[0.09] text-[12px] font-['Geist'] text-white/90 placeholder:text-white/30 outline-none focus:border-white/25 transition-colors"
          />
        </div>

        {error && (
          <div className="mx-4 mb-2.5 px-3 py-2 rounded-[9px] bg-red-500/10 border border-red-400/25">
            <span className="text-[11px] font-medium font-['Geist'] text-red-200/90 leading-relaxed">
              {error}
            </span>
          </div>
        )}

        <div className="px-4 pb-1 shrink-0">
          <p className="text-[11px] font-['Geist'] text-white/40 leading-relaxed">
            Imports are read-only context. New agents start fresh in the same folder with this
            transcript attached — the outside session is never resumed.
          </p>
        </div>

        {isLoading && sessions.length === 0 ? (
          <div className="px-4 pb-5 pt-3">
            <p className="text-[12px] font-['Geist'] text-white/45">Scanning ~/.claude/projects…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 pb-5 pt-3">
            <p className="text-[12px] font-['Geist'] text-white/45 leading-relaxed">
              {sessions.length === 0
                ? 'No Claude Code chats found on this machine.'
                : 'No chats match this search.'}
            </p>
          </div>
        ) : (
          <ScrollArea maxHeight={380} className="px-4 pb-4 flex flex-col gap-1.5">
            {filtered.map((s) => (
              <div
                key={s.filePath}
                className="group flex items-start gap-2.5 p-2 rounded-[10px] border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] transition-all duration-150"
              >
                <div className="pt-0.5 shrink-0 flex items-center">
                  <span className="material-symbols-rounded text-[16px] text-white/50 leading-none">
                    forum
                  </span>
                </div>
                <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                  <span className="text-[12px] font-medium font-['Geist'] text-white/95 tracking-tight truncate">
                    {s.title || 'Untitled chat'}
                  </span>
                  <span className="text-[10.5px] font-['Geist'] text-white/40 truncate">
                    {[shortCwd(s.cwd), s.messageCount ? `${s.messageCount} msgs` : '', relativeTime(s.updatedAt)]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <button
                  type="button"
                  title="Import this chat"
                  disabled={isImporting}
                  onClick={() => onImport(s.filePath)}
                  className="h-[24px] px-2.5 rounded-[7px] bg-white/90 hover:bg-white active:scale-95 disabled:opacity-50 disabled:cursor-default text-[11px] font-semibold font-['Geist'] text-black tracking-tight transition-all duration-150 cursor-pointer shrink-0"
                >
                  {isImporting ? 'Importing…' : 'Import'}
                </button>
              </div>
            ))}
          </ScrollArea>
        )}
      </div>
    </div>
  );
};

export default ImportClaudeDialog;
