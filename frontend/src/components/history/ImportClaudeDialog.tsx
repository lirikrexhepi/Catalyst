import React, { useEffect, useMemo, useState } from 'react';
import { ScrollArea } from '../common/ScrollArea';
import { useTheme } from '../../themes';
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
  const [showAgents, setShowAgents] = useState(false);
  const { currentTheme } = useTheme();
  const isLight = currentTheme.id === 'light' || currentTheme.id === 'white';
  const isGlass = currentTheme.id === 'glass';

  useEffect(() => {
    onRefresh();
  }, [onRefresh]);

  const hiddenAgents = useMemo(() => sessions.filter((s) => s.agentRun).length, [sessions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions.filter((s) => {
      if (s.agentRun && !showAgents) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        (s.cwd || '').toLowerCase().includes(q) ||
        (s.preview || '').toLowerCase().includes(q)
      );
    });
  }, [sessions, query, showAgents]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] max-h-[70vh] flex flex-col rounded-[24px] overflow-hidden select-none"
        style={{
          backgroundColor: isLight
            ? 'rgba(255, 255, 255, 0.94)'
            : isGlass
            ? 'rgba(10, 14, 26, 0.65)'
            : 'rgba(3, 3, 3, 0.95)',
          border: isLight
            ? '1px solid rgba(0, 0, 0, 0.10)'
            : isGlass
            ? '1px solid rgba(255, 255, 255, 0.22)'
            : '1px solid rgba(255, 255, 255, 0.08)',
          backdropFilter: isGlass ? 'blur(16px) saturate(150%)' : undefined,
          WebkitBackdropFilter: isGlass ? 'blur(16px) saturate(150%)' : undefined,
          boxShadow: isLight
            ? '0 12px 32px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.06)'
            : '0 16px 40px rgba(0, 0, 0, 0.85), 0 4px 12px rgba(0, 0, 0, 0.6)',
        }}
      >
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2 shrink-0">
          <div className="flex items-center gap-2">
            <span
              className={`material-symbols-rounded text-[18px] leading-none ${
                isLight ? 'text-black/70' : 'text-white/80'
              }`}
            >
              upload
            </span>
            <span
              className={`text-[13px] font-semibold font-['Geist'] tracking-tight ${
                isLight ? 'text-black' : 'text-white'
              }`}
            >
              Import Claude Code chat
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="Refresh"
              onClick={onRefresh}
              className={`w-[24px] h-[24px] rounded-[7px] active:scale-90 flex items-center justify-center transition-all duration-150 cursor-pointer ${
                isLight
                  ? 'hover:bg-black/10 text-black/40 hover:text-black'
                  : 'hover:bg-white/10 text-white/45 hover:text-white/90'
              }`}
            >
              <span className="material-symbols-rounded text-[16px] leading-none">refresh</span>
            </button>
            <button
              type="button"
              title="Close"
              onClick={onClose}
              className={`w-[24px] h-[24px] rounded-[7px] active:scale-90 flex items-center justify-center transition-all duration-150 cursor-pointer ${
                isLight
                  ? 'hover:bg-black/10 text-black/40 hover:text-black'
                  : 'hover:bg-white/10 text-white/45 hover:text-white/90'
              }`}
            >
              <span className="material-symbols-rounded text-[16px] leading-none">close</span>
            </button>
          </div>
        </div>

        <div className="px-4 pb-2 shrink-0">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats…"
            className={`w-full h-[30px] px-3 rounded-[9px] border text-[12px] font-['Geist'] outline-none transition-colors ${
              isLight
                ? 'bg-black/[0.05] border-black/10 text-black/90 placeholder:text-black/35 focus:border-black/25'
                : 'bg-white/[0.06] border-white/[0.09] text-white/90 placeholder:text-white/30 focus:border-white/25'
            }`}
          />
        </div>

        {error && (
          <div className="mx-4 mb-2 px-3 py-2 rounded-[9px] bg-red-500/10 border border-red-400/25 shrink-0">
            <span className="text-[11px] font-medium font-['Geist'] text-red-200/90 leading-relaxed">
              {error}
            </span>
          </div>
        )}

        {isLoading && sessions.length === 0 ? (
          <div className="px-4 pb-5 pt-3">
            <p
              className={`text-[12px] font-['Geist'] ${
                isLight ? 'text-black/50' : 'text-white/45'
              }`}
            >
              Scanning previous chats…
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 pb-5 pt-3">
            <p
              className={`text-[12px] font-['Geist'] leading-relaxed ${
                isLight ? 'text-black/50' : 'text-white/45'
              }`}
            >
              {sessions.length === 0
                ? 'No Claude Code chats found on this machine.'
                : 'No chats match this search.'}
            </p>
          </div>
        ) : (
          <>
            {hiddenAgents > 0 && (
              <button
                type="button"
                onClick={() => setShowAgents((v) => !v)}
                className={`mx-4 mb-1.5 h-[26px] rounded-[8px] flex items-center justify-center gap-1.5 text-[11px] font-medium font-['Geist'] transition-all cursor-pointer shrink-0 ${
                  isLight
                    ? 'bg-black/[0.05] hover:bg-black/[0.09] text-black/60'
                    : 'bg-white/[0.05] hover:bg-white/[0.1] text-white/55'
                }`}
              >
                <span className="material-symbols-rounded text-[14px] leading-none">
                  {showAgents ? 'visibility_off' : 'visibility'}
                </span>
                <span>
                  {showAgents
                    ? 'Hide agent runs'
                    : `Show ${hiddenAgents} agent-run chats`}
                </span>
              </button>
            )}
          <ScrollArea maxHeight={360} className="px-3 pb-3 flex flex-col gap-0.5">
            {filtered.map((s) => (
              <div
                key={s.filePath}
                className={`group flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[10px] transition-colors ${
                  isLight ? 'hover:bg-black/[0.04]' : 'hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`material-symbols-rounded text-[16px] leading-none shrink-0 ${
                      isLight ? 'text-black/45' : 'text-white/50'
                    }`}
                  >
                    forum
                  </span>
                  <div className="flex flex-col min-w-0">
                    <span
                      className={`text-[12px] font-medium tracking-tight truncate leading-[14px] ${
                        isLight ? 'text-black/90' : 'text-white'
                      }`}
                    >
                      {s.title || 'Untitled chat'}
                    </span>
                    <span
                      className={`text-[10px] truncate leading-[13px] ${
                        isLight ? 'text-black/45' : 'text-white/40'
                      }`}
                    >
                      {relativeTime(s.updatedAt)}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  title="Import this chat"
                  disabled={isImporting}
                  onClick={() => onImport(s.filePath)}
                  className="h-[24px] px-3 rounded-[8px] bg-white/90 hover:bg-white active:scale-95 disabled:opacity-50 disabled:cursor-default text-[11px] font-semibold font-['Geist'] text-black tracking-tight transition-all duration-150 cursor-pointer shrink-0"
                >
                  {isImporting ? 'Importing…' : 'Import'}
                </button>
              </div>
            ))}
          </ScrollArea>
          </>
        )}

        <div
          className={`px-4 py-2.5 shrink-0 border-t ${
            isLight ? 'border-black/[0.07]' : 'border-white/[0.07]'
          }`}
        >
          <p
            className={`text-[10.5px] font-['Geist'] leading-relaxed ${
              isLight ? 'text-black/45' : 'text-white/40'
            }`}
          >
            Imports are read-only. Messaging one starts a fresh agent with this chat as context.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ImportClaudeDialog;
