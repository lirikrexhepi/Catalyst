import React, { useState } from 'react';
import { LiquidGlass } from '../../liquid-glass';
import { ClipboardSetText } from '../../../wailsjs/runtime/runtime';
import { ResizeHandles } from '../common/ResizeHandles';
import { useFloatingWindow } from '../common/useFloatingWindow';
import { domain } from '../../../wailsjs/go/models';
import { DiffView } from './DiffView';
import { FileKey, GitState } from './useGit';

export interface GitWindowProps {
  git: GitState;
  initialPosition: { x: number; y: number };
  initialSize: { width: number; height: number };
  isFocused?: boolean;
  onFocus?: () => void;
  onClose: () => void;
}

const MIN_SIZE = { width: 640, height: 420 };

const PANEL_STYLE: React.CSSProperties = {
  boxShadow:
    '0 24px 60px rgba(0, 0, 0, 0.55), 0 4px 16px rgba(0, 0, 0, 0.3), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.25)',
};

const STATUS_MARKS: Record<string, { mark: string; tone: string; label: string }> = {
  added: { mark: 'A', tone: 'text-emerald-300/90', label: 'Added' },
  modified: { mark: 'M', tone: 'text-amber-300/90', label: 'Modified' },
  deleted: { mark: 'D', tone: 'text-rose-300/90', label: 'Deleted' },
  renamed: { mark: 'R', tone: 'text-sky-300/90', label: 'Renamed' },
  copied: { mark: 'C', tone: 'text-sky-300/90', label: 'Copied' },
  untracked: { mark: 'U', tone: 'text-emerald-300/70', label: 'New' },
  conflicted: { mark: '!', tone: 'text-rose-400', label: 'Conflicted' },
};

function fileName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] ?? path;
}

function directory(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut > 0 ? path.slice(0, cut) : '';
}

function whenAgo(at: number): string {
  if (!at) return '';
  const minutes = Math.floor((Date.now() - at) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

const IconButton: React.FC<{
  icon: string;
  title: string;
  onClick: () => void;
  tone?: string;
}> = ({ icon, title, onClick, tone = 'text-white/45 hover:text-white/90' }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onClick={onClick}
    className={`w-[24px] h-[24px] rounded-[7px] hover:bg-white/10 active:scale-90 flex items-center justify-center transition-all duration-150 cursor-pointer shrink-0 ${tone}`}
  >
    <span className="material-symbols-rounded text-[16px] leading-none">{icon}</span>
  </button>
);

/**
 * A floating view of what has changed, tabbed by agent.
 *
 * Each tab is one checkout: the project itself, or the isolated worktree an
 * agent was given. Read-mostly by design — it reports what changed and lets a
 * worktree be removed, and leaves committing and merging to git.
 */
export const GitWindow: React.FC<GitWindowProps> = ({
  git,
  initialPosition,
  initialSize,
  isFocused = false,
  onFocus,
  onClose,
}) => {
  const { position, size, ref, onTitleMouseDown, onResizeMouseDown, isGesturing } =
    useFloatingWindow({ initialPosition, initialSize, minSize: MIN_SIZE });

  const [confirmRemoval, setConfirmRemoval] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { lanes, activeLane, view, selectedFile, diffs } = git;
  const files = activeLane?.files ?? [];
  const commits = activeLane?.commits ?? [];

  const copy = async (text: string, what: string) => {
    await ClipboardSetText(text);
    setNotice(`Copied ${what}`);
    window.setTimeout(() => setNotice(null), 1600);
  };

  const copyDiff = () => {
    const text = diffs
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
    if (text) void copy(text, 'diff');
  };

  const removeLane = async (lane: domain.WorktreeChanges, force: boolean) => {
    const failure = await git.removeWorktree(lane.path, force);
    if (!failure) {
      setConfirmRemoval(null);
      setNotice('Worktree removed');
      window.setTimeout(() => setNotice(null), 1600);
      return;
    }
    // git refuses while the checkout holds work; that refusal becomes the
    // prompt rather than something to swallow and retry behind the user's back.
    setConfirmRemoval(lane.path);
    setNotice(failure);
  };

  const isSelected = (file: domain.FileChange) =>
    view.kind === 'changes' &&
    selectedFile?.path === file.path &&
    selectedFile?.staged === file.staged;

  const key = (file: domain.FileChange, index: number) =>
    `${file.staged ? 's' : 'w'}-${file.path}-${index}`;

  return (
    <div
      ref={ref}
      onMouseDown={onFocus}
      className="absolute select-none pointer-events-auto"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        zIndex: isGesturing ? 38 : isFocused ? 36 : 26,
        willChange: isGesturing ? 'transform' : undefined,
      }}
    >
      <LiquidGlass
        variant="panel"
        surface="squircle"
        radius={18}
        bezelWidth={20}
        glassThickness={26}
        refractionScale={0.8}
        blur={0.6}
        specularOpacity={0.6}
        specularSaturation={6}
        lightAngle={-45}
        tint="rgba(30, 32, 38, 0.65)"
        shadow="apple"
        border="1px solid rgba(255, 255, 255, 0.16)"
        className="w-full h-full p-3 text-white shadow-2xl relative box-border"
        style={PANEL_STYLE}
      >
        <div className="flex flex-col h-full w-full min-h-0 gap-2">
          <div
            onMouseDown={onTitleMouseDown}
            className="flex items-center gap-2 shrink-0 cursor-grab active:cursor-grabbing"
          >
            <span className="material-symbols-rounded text-[17px] text-white/80 leading-none">
              account_tree
            </span>
            <span className="text-[12.5px] font-semibold font-['Geist'] text-white tracking-tight">
              Changes
            </span>

            {/* One tab per checkout: the project, then each agent's worktree. */}
            <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0 no-scrollbar">
              {lanes.map((lane) => {
                const active = lane.path === git.activeLanePath;
                const count = lane.files?.length ?? 0;
                return (
                  <button
                    key={lane.path}
                    type="button"
                    title={`${lane.path}${lane.branch ? ` · ${lane.branch}` : ''}`}
                    onClick={() => git.selectLane(lane.path)}
                    className={`h-[24px] pl-2 pr-2 rounded-[8px] flex items-center gap-1.5 text-[11.5px] font-medium font-['Geist'] tracking-tight transition-all duration-150 cursor-pointer shrink-0 max-w-[170px] ${
                      active
                        ? 'bg-white/[0.14] text-white'
                        : 'text-white/50 hover:text-white/85 hover:bg-white/[0.07]'
                    }`}
                  >
                    <span className="material-symbols-rounded text-[13px] leading-none shrink-0">
                      {lane.isMain ? 'home_storage' : 'linked_services'}
                    </span>
                    <span className="truncate">{lane.title}</span>
                    {lane.orphaned && (
                      <span
                        title="No agent in this session claims this worktree"
                        className="material-symbols-rounded text-[13px] leading-none text-amber-300/90 shrink-0"
                      >
                        warning
                      </span>
                    )}
                    {count > 0 && (
                      <span className="text-[10px] tabular-nums text-white/45 shrink-0">{count}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <IconButton icon="refresh" title="Refresh" onClick={() => void git.refresh()} />
            <IconButton icon="close" title="Close" onClick={onClose} />
          </div>

          {git.error && (
            <div className="px-3 py-2 rounded-[9px] bg-red-500/10 border border-red-400/25 shrink-0">
              <span className="text-[11px] font-medium font-['Geist'] text-red-200/90">
                {git.error}
              </span>
            </div>
          )}

          {activeLane && (
            <div className="flex items-center gap-2 shrink-0 px-0.5">
              <span className="material-symbols-rounded text-[13px] leading-none text-white/35">
                fork_right
              </span>
              <span className="text-[11px] font-['Geist'] text-white/60 tracking-tight truncate max-w-[220px]">
                {activeLane.branch || 'detached'}
              </span>
              {!!activeLane.base && !activeLane.isMain && (
                <span className="text-[10.5px] font-['Geist'] text-white/30 tracking-tight truncate">
                  from {activeLane.base}
                </span>
              )}
              {activeLane.ahead > 0 && (
                <span className="text-[10.5px] font-['Geist'] text-emerald-300/70 tabular-nums">
                  {activeLane.ahead} ahead
                </span>
              )}

              <div className="flex items-center gap-0.5 ml-auto">
                <IconButton
                  icon="folder_open"
                  title="Reveal in file explorer"
                  onClick={() => void git.reveal(activeLane.path)}
                />
                <IconButton
                  icon="content_copy"
                  title="Copy branch name"
                  onClick={() => void copy(activeLane.branch, 'branch name')}
                />
                <IconButton icon="difference" title="Copy diff" onClick={copyDiff} />
                {!activeLane.isMain && (
                  <IconButton
                    icon="delete"
                    title="Remove this worktree"
                    tone="text-white/40 hover:text-rose-300"
                    onClick={() => setConfirmRemoval(activeLane.path)}
                  />
                )}
              </div>
            </div>
          )}

          {confirmRemoval === activeLane?.path && activeLane && (
            <div className="px-3 py-2.5 rounded-[10px] bg-rose-500/10 border border-rose-400/25 shrink-0 flex flex-col gap-2">
              <span className="text-[11.5px] font-['Geist'] text-rose-100/90 leading-relaxed">
                Remove the worktree at {activeLane.path}?
                {activeLane.ahead > 0 &&
                  ` It has ${activeLane.ahead} commit${activeLane.ahead === 1 ? '' : 's'} not on ${activeLane.base || 'the base branch'}, which stay on the branch.`}
                {files.length > 0 &&
                  ` ${files.length} uncommitted change${files.length === 1 ? '' : 's'} would be lost.`}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void removeLane(activeLane, false)}
                  className="h-[24px] px-2.5 rounded-[7px] bg-white/10 hover:bg-white/20 text-[11px] font-medium font-['Geist'] transition-all cursor-pointer"
                >
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() => void removeLane(activeLane, true)}
                  className="h-[24px] px-2.5 rounded-[7px] bg-rose-500/25 hover:bg-rose-500/40 text-[11px] font-medium font-['Geist'] text-rose-100 transition-all cursor-pointer"
                >
                  Force remove
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmRemoval(null);
                    setNotice(null);
                  }}
                  className="h-[24px] px-2.5 rounded-[7px] hover:bg-white/10 text-[11px] font-medium font-['Geist'] text-white/60 transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div
            className={`flex-1 min-h-0 flex gap-2 ${isGesturing ? 'pointer-events-none' : ''}`}
          >
            <div className="w-[248px] shrink-0 flex flex-col min-h-0 rounded-[11px] bg-[#0b0d10]/80 border border-white/[0.08] overflow-hidden">
              <div className="flex items-center gap-1 p-1.5 shrink-0 border-b border-white/[0.07]">
                <button
                  type="button"
                  onClick={() => git.selectView({ kind: 'changes' })}
                  className={`h-[22px] px-2 rounded-[6px] text-[11px] font-medium font-['Geist'] transition-all cursor-pointer ${
                    view.kind === 'changes'
                      ? 'bg-white/[0.14] text-white'
                      : 'text-white/45 hover:text-white/85'
                  }`}
                >
                  Changes {files.length > 0 && <span className="tabular-nums">{files.length}</span>}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    commits[0] && git.selectView({ kind: 'commit', sha: commits[0].sha })
                  }
                  className={`h-[22px] px-2 rounded-[6px] text-[11px] font-medium font-['Geist'] transition-all cursor-pointer ${
                    view.kind === 'commit'
                      ? 'bg-white/[0.14] text-white'
                      : 'text-white/45 hover:text-white/85'
                  }`}
                >
                  History {commits.length > 0 && <span className="tabular-nums">{commits.length}</span>}
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto">
                {view.kind === 'changes' ? (
                  files.length === 0 ? (
                    <p className="p-3 text-[11.5px] font-['Geist'] text-white/35 leading-relaxed">
                      {activeLane?.error
                        ? activeLane.error
                        : 'No uncommitted changes in this checkout.'}
                    </p>
                  ) : (
                    files.map((file, index) => {
                      const badge = STATUS_MARKS[file.status] ?? STATUS_MARKS.modified;
                      const folder = directory(file.path);
                      return (
                        <button
                          key={key(file, index)}
                          type="button"
                          title={`${badge.label}: ${file.path}${file.staged ? ' (staged)' : ''}`}
                          onClick={() => git.selectFile({ path: file.path, staged: file.staged })}
                          className={`w-full text-left px-2.5 py-1.5 flex items-center gap-2 transition-colors cursor-pointer ${
                            isSelected(file) ? 'bg-white/[0.12]' : 'hover:bg-white/[0.06]'
                          }`}
                        >
                          <span
                            className={`text-[11px] font-bold font-mono w-[10px] shrink-0 ${badge.tone}`}
                          >
                            {badge.mark}
                          </span>
                          <span className="flex flex-col min-w-0 flex-1">
                            <span className="text-[11.5px] font-['Geist'] text-white/85 tracking-tight truncate">
                              {fileName(file.path)}
                            </span>
                            {!!folder && (
                              <span className="text-[10px] font-['Geist'] text-white/30 truncate">
                                {folder}
                              </span>
                            )}
                          </span>
                          {file.staged && (
                            <span className="text-[9px] font-['Geist'] text-sky-300/70 shrink-0 uppercase tracking-wide">
                              staged
                            </span>
                          )}
                        </button>
                      );
                    })
                  )
                ) : commits.length === 0 ? (
                  <p className="p-3 text-[11.5px] font-['Geist'] text-white/35">
                    No commits on this branch yet.
                  </p>
                ) : (
                  commits.map((commit) => (
                    <button
                      key={commit.sha}
                      type="button"
                      onClick={() => git.selectView({ kind: 'commit', sha: commit.sha })}
                      className={`w-full text-left px-2.5 py-1.5 flex flex-col gap-0.5 transition-colors cursor-pointer ${
                        view.kind === 'commit' && view.sha === commit.sha
                          ? 'bg-white/[0.12]'
                          : 'hover:bg-white/[0.06]'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        {/* Inherited commits are dimmed so an agent's own work
                            stands out from the history it branched off. */}
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            commit.onBase ? 'bg-white/20' : 'bg-emerald-400/80'
                          }`}
                        />
                        <span
                          className={`text-[11.5px] font-['Geist'] tracking-tight truncate ${
                            commit.onBase ? 'text-white/45' : 'text-white/90'
                          }`}
                        >
                          {commit.subject}
                        </span>
                      </span>
                      <span className="text-[10px] font-['Geist'] text-white/30 truncate pl-3">
                        {commit.short} · {commit.author} · {whenAgo(commit.at)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="flex-1 min-w-0 flex flex-col rounded-[11px] bg-[#0b0d10]/80 border border-white/[0.08] overflow-hidden">
              <DiffView
                diffs={diffs}
                isLoading={git.isDiffLoading}
                error={git.diffError}
                placeholder={
                  view.kind === 'commit'
                    ? 'Select a commit to see what it changed.'
                    : files.length === 0
                      ? 'Nothing has changed in this checkout.'
                      : 'Select a file to see its diff.'
                }
              />
            </div>
          </div>

          {notice && (
            <span className="shrink-0 text-[10.5px] font-['Geist'] text-white/45 px-0.5 truncate">
              {notice}
            </span>
          )}
        </div>
      </LiquidGlass>

      <ResizeHandles onResize={onResizeMouseDown} />
    </div>
  );
};

export default GitWindow;
