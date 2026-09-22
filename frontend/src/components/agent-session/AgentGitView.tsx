import React, { useState, useEffect } from 'react';
import { domain } from '../../../wailsjs/go/models';
import { DiffView } from '../git/DiffView';
import { FileKey, GitState } from '../git/useGit';
import { GitBranch, FolderOpen, Copy, Check, RefreshCw } from 'lucide-react';
import { ClipboardSetText } from '../../../wailsjs/runtime/runtime';

export interface AgentGitViewProps {
  threadId?: string;
  branch?: string;
  git?: GitState;
  className?: string;
}

const STATUS_MARKS: Record<string, { mark: string; tone: string; bg: string }> = {
  added: { mark: 'A', tone: 'text-emerald-300', bg: 'bg-emerald-500/15' },
  modified: { mark: 'M', tone: 'text-amber-300', bg: 'bg-amber-500/15' },
  deleted: { mark: 'D', tone: 'text-rose-300', bg: 'bg-rose-500/15' },
  renamed: { mark: 'R', tone: 'text-sky-300', bg: 'bg-sky-500/15' },
  copied: { mark: 'C', tone: 'text-sky-300', bg: 'bg-sky-500/15' },
  untracked: { mark: 'U', tone: 'text-emerald-300/80', bg: 'bg-emerald-500/10' },
  conflicted: { mark: '!', tone: 'text-rose-400', bg: 'bg-rose-500/25' },
};

function fileName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] ?? path;
}

function directory(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut > 0 ? path.slice(0, cut) : '';
}

export const AgentGitView: React.FC<AgentGitViewProps> = ({
  threadId,
  branch,
  git,
  className = '',
}) => {
  const [copiedNotice, setCopiedNotice] = useState<string | null>(null);

  if (!git) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-white/40 text-[12px]">
        Loading git status...
      </div>
    );
  }

  // Find the worktree lane matching this agent
  const matchingLane =
    git.lanes.find(
      (l) =>
        (threadId && l.threadId === threadId) ||
        (branch && l.branch === branch) ||
        (l.title && threadId && l.title.includes(threadId)),
    ) ||
    git.lanes.find((l) => l.isMain) ||
    git.activeLane ||
    git.lanes[0] ||
    null;

  useEffect(() => {
    if (matchingLane && git.activeLanePath !== matchingLane.path) {
      git.selectLane(matchingLane.path);
    }
  }, [matchingLane?.path, git.activeLanePath, git.selectLane]);

  const files = matchingLane?.files ?? [];
  const commits = matchingLane?.commits ?? [];

  const copy = async (text: string, label: string) => {
    await ClipboardSetText(text);
    setCopiedNotice(label);
    window.setTimeout(() => setCopiedNotice(null), 1600);
  };

  const copyDiff = () => {
    const text = git.diffs
      .map((diff) =>
        (diff.hunks ?? [])
          .map(
            (hunk) =>
              `${hunk.header}\n` +
              (hunk.lines ?? [])
                .map(
                  (line) =>
                    `${line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' '}${line.content}`,
                )
                .join('\n'),
          )
          .join('\n'),
      )
      .join('\n\n');
    if (text) void copy(text, 'Diff copied');
  };

  return (
    <div className={`flex flex-col h-full w-full min-h-0 select-none ${className}`}>
      {/* Subheader Toolbar */}
      <div className="flex items-center justify-between shrink-0 pb-2 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-[7px] bg-white/[0.06] text-white/80 text-[11px] font-mono">
            <GitBranch size={13} className="text-white/60 shrink-0" />
            <span className="truncate max-w-[180px]">
              {matchingLane?.branch || branch || 'main'}
            </span>
          </div>

          {files.length > 0 && (
            <span className="text-[11px] font-medium font-['Geist'] text-white/45">
              {files.length} changed file{files.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {matchingLane && (
            <button
              type="button"
              title="Reveal in File Explorer"
              onClick={() => void git.reveal(matchingLane.path)}
              className="h-[26px] px-2 rounded-[6px] bg-white/[0.05] hover:bg-white/10 active:scale-95 text-white/70 hover:text-white text-[11px] font-medium font-['Geist'] flex items-center gap-1 transition-all cursor-pointer"
            >
              <FolderOpen size={13} />
              <span>Reveal</span>
            </button>
          )}

          {files.length > 0 && (
            <button
              type="button"
              title="Copy Unified Diff"
              onClick={copyDiff}
              className="h-[26px] px-2 rounded-[6px] bg-white/[0.05] hover:bg-white/10 active:scale-95 text-white/70 hover:text-white text-[11px] font-medium font-['Geist'] flex items-center gap-1 transition-all cursor-pointer"
            >
              {copiedNotice ? (
                <>
                  <Check size={13} className="text-emerald-400" />
                  <span className="text-emerald-300">Copied</span>
                </>
              ) : (
                <>
                  <Copy size={13} />
                  <span>Copy Diff</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            title="Refresh Git status"
            onClick={() => void git.refresh()}
            className="w-[26px] h-[26px] rounded-[6px] flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
          >
            <RefreshCw size={13} className={git.isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Main Git Content: Left File List + Right Diff View */}
      <div className="flex-1 min-h-0 flex gap-2.5 pt-2.5">
        {/* Left File/History List */}
        <div className="w-[240px] shrink-0 flex flex-col min-h-0 rounded-xl bg-black/40 overflow-hidden">
          <div className="flex items-center p-1 bg-white/[0.02]">
            <button
              type="button"
              onClick={() => git.selectView({ kind: 'changes' })}
              className={`flex-1 py-1 rounded-[6px] text-[11px] font-medium font-['Geist'] text-center transition-all cursor-pointer ${
                git.view.kind === 'changes'
                  ? 'bg-white/15 text-white shadow-sm font-semibold'
                  : 'text-white/45 hover:text-white/80'
              }`}
            >
              Changes {files.length > 0 && `(${files.length})`}
            </button>
            <button
              type="button"
              onClick={() =>
                commits[0] && git.selectView({ kind: 'commit', sha: commits[0].sha })
              }
              className={`flex-1 py-1 rounded-[6px] text-[11px] font-medium font-['Geist'] text-center transition-all cursor-pointer ${
                git.view.kind === 'commit'
                  ? 'bg-white/15 text-white shadow-sm font-semibold'
                  : 'text-white/45 hover:text-white/80'
              }`}
            >
              Commits {commits.length > 0 && `(${commits.length})`}
            </button>
          </div>

          {/* Files / Commits List */}
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-1">
            {git.view.kind === 'changes' ? (
              files.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center p-5 h-full">
                  <div className="w-9 h-9 rounded-xl bg-white/[0.05] flex items-center justify-center mb-2">
                    <GitBranch size={16} className="text-white/35" />
                  </div>
                  <span className="text-[12px] font-medium text-white/50 font-['Geist'] mb-0.5">
                    Working tree clean
                  </span>
                  <span className="text-[10.5px] text-white/35 font-['Geist'] max-w-[160px]">
                    No uncommitted changes in this agent worktree.
                  </span>
                </div>
              ) : (
                files.map((file, idx) => {
                  const isSelected =
                    git.selectedFile?.path === file.path &&
                    git.selectedFile?.staged === file.staged;
                  const badge = STATUS_MARKS[file.status] ?? STATUS_MARKS.modified;
                  const name = fileName(file.path);
                  const dir = directory(file.path);

                  return (
                    <button
                      key={`${file.path}-${idx}`}
                      type="button"
                      onClick={() => git.selectFile({ path: file.path, staged: file.staged })}
                      className={`w-full text-left px-2 py-1.5 rounded-[7px] flex items-center gap-2 transition-all cursor-pointer mb-0.5 ${
                        isSelected
                          ? 'bg-white/15 text-white'
                          : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded-[4px] flex items-center justify-center text-[10px] font-mono font-bold shrink-0 ${badge.bg} ${badge.tone}`}
                      >
                        {badge.mark}
                      </span>
                      <div className="flex-1 min-w-0 truncate">
                        <div className="text-[12px] font-medium font-['Geist'] truncate">{name}</div>
                        {dir && (
                          <div className="text-[10px] text-white/35 font-mono truncate">{dir}</div>
                        )}
                      </div>
                    </button>
                  );
                })
              )
            ) : (
              commits.map((c) => {
                const isSelected = git.view.kind === 'commit' && git.view.sha === c.sha;
                return (
                  <button
                    key={c.sha}
                    type="button"
                    onClick={() => git.selectView({ kind: 'commit', sha: c.sha })}
                    className={`w-full text-left px-2 py-1.5 rounded-[7px] flex flex-col gap-0.5 transition-all cursor-pointer mb-0.5 ${
                      isSelected
                        ? 'bg-white/15 text-white'
                        : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 text-[11px] font-mono text-white/40">
                      <span>{c.short}</span>
                      <span>{c.author}</span>
                    </div>
                    <div className="text-[12px] font-medium font-['Geist'] truncate">
                      {c.subject}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Diff Viewport */}
        <div className="flex-1 min-h-0 rounded-xl bg-[#0d0f12] overflow-hidden flex flex-col">
          <DiffView
            diffs={git.diffs}
            isLoading={git.isDiffLoading}
            error={git.diffError}
            placeholder={
              files.length === 0
                ? 'No modified files to display.'
                : 'Select a file to inspect its diff.'
            }
          />
        </div>
      </div>
    </div>
  );
};

export default AgentGitView;
