import React, { useState } from 'react';
import { domain } from '../../../wailsjs/go/models';

export interface DiffViewProps {
  diffs: domain.DiffFile[];
  isLoading: boolean;
  error: string | null;
  /** Shown when there is nothing selected rather than nothing to show. */
  placeholder: string;
}

const ROW_TONES: Record<string, string> = {
  added: 'bg-emerald-400/[0.09]',
  removed: 'bg-rose-400/[0.09]',
  context: '',
};

const MARKERS: Record<string, string> = {
  added: '+',
  removed: '-',
  context: ' ',
};

const TEXT_TONES: Record<string, string> = {
  added: 'text-emerald-100/90',
  removed: 'text-rose-100/90',
  context: 'text-white/60',
};

const Gutter: React.FC<{ value: number }> = ({ value }) => (
  <span className="w-[42px] shrink-0 pr-2 text-right text-white/25 select-none tabular-nums">
    {value > 0 ? value : ''}
  </span>
);

const MAX_LINE_CHARS = 1200;
const INITIAL_ROWS = 800;
const ROW_HEIGHT = 18;

const Row = React.memo<{ line: domain.DiffLine }>(({ line }) => (
  <div className={`flex ${ROW_TONES[line.kind] ?? ''}`}>
    <Gutter value={line.old ?? 0} />
    <Gutter value={line.new ?? 0} />
    <span className={`w-[14px] shrink-0 select-none ${TEXT_TONES[line.kind] ?? ''}`}>
      {MARKERS[line.kind] ?? ' '}
    </span>
    {/* Tabs and runs of spaces carry meaning in code, so the row preserves
        whitespace and scrolls sideways rather than wrapping mid-token. */}
    <span className={`whitespace-pre flex-1 ${TEXT_TONES[line.kind] ?? ''}`}>
      {line.content ? (line.content.length > MAX_LINE_CHARS ? `${line.content.slice(0, MAX_LINE_CHARS)}…` : line.content) : ' '}
    </span>
  </div>
));
Row.displayName = 'DiffRow';

const Hunk = React.memo<{ hunk: domain.DiffHunk; budget: number }>(({ hunk, budget }) => {
  const lines = hunk.lines ?? [];
  const shown = lines.length > budget ? lines.slice(0, budget) : lines;
  return (
    <div
      className="flex flex-col"
      style={{ contentVisibility: 'auto', containIntrinsicSize: `auto ${(shown.length + 1) * ROW_HEIGHT}px` }}
    >
      <div className="px-3 py-1 bg-white/[0.04] text-[10.5px] font-mono text-white/35 whitespace-pre truncate">
        {hunk.header}
      </div>
      {shown.map((line, row) => (
        <Row key={row} line={line} />
      ))}
    </div>
  );
});
Hunk.displayName = 'DiffHunk';

const FileDiff: React.FC<{ diff: domain.DiffFile; showHeader: boolean }> = ({
  diff,
  showHeader,
}) => {
  const [limit, setLimit] = useState(INITIAL_ROWS);
  const hunks = diff.hunks ?? [];
  const total = hunks.reduce((sum, hunk) => sum + (hunk.lines?.length ?? 0), 0);
  let remaining = limit;
  return (
  <div className="flex flex-col">
    {showHeader && (
      <div className="sticky top-0 z-10 flex items-baseline gap-2 px-3 py-1.5 bg-[#15171c]/95 border-b border-white/[0.07] backdrop-blur-sm">
        <span className="text-[11.5px] font-medium font-(family-name:--app-font) text-white/80 tracking-tight truncate">
          {diff.oldPath ? `${diff.oldPath} → ${diff.path}` : diff.path}
        </span>
        <span className="text-[10.5px] font-(family-name:--app-font) tabular-nums shrink-0 ml-auto">
          <span className="text-emerald-300/80">+{diff.insertions}</span>{' '}
          <span className="text-rose-300/80">−{diff.deletions}</span>
        </span>
      </div>
    )}

    {diff.binary ? (
      <p className="px-3 py-3 text-[12px] font-(family-name:--app-font) text-white/40">Binary file — no preview.</p>
    ) : (
      hunks.map((hunk, index) => {
        const budget = Math.max(0, remaining);
        remaining -= hunk.lines?.length ?? 0;
        if (budget <= 0 && index > 0) return null;
        return <Hunk key={`${diff.path}-${index}`} hunk={hunk} budget={budget} />;
      })
    )}

    {!diff.binary && total > limit && (
      <button
        type="button"
        onClick={() => setLimit((value) => value + 2000)}
        className="px-3 py-2 text-left text-[11px] font-(family-name:--app-font) text-sky-300/80 hover:text-sky-200 cursor-pointer"
      >
        Show {Math.min(2000, total - limit)} more lines ({total - limit} hidden)
      </button>
    )}

    {diff.truncated && (
      <p className="px-3 py-2 text-[11px] font-(family-name:--app-font) text-amber-300/70">
        Diff truncated — the file is too large to show in full.
      </p>
    )}

    {!diff.binary && !diff.truncated && (diff.hunks?.length ?? 0) === 0 && (
      <p className="px-3 py-3 text-[12px] font-(family-name:--app-font) text-white/40">
        No textual changes — this may be a mode or permission change.
      </p>
    )}
  </div>
  );
};

/** The right-hand pane: one file's diff, or every file a commit touched. */
export const DiffView: React.FC<DiffViewProps> = ({ diffs, isLoading, error, placeholder }) => {
  if (error) {
    return (
      <div className="flex-1 min-h-0 grid place-items-center p-6">
        <p className="text-[12px] font-(family-name:--app-font) text-red-200/80 text-center leading-relaxed max-w-[320px]">
          {error}
        </p>
      </div>
    );
  }

  if (isLoading && diffs.length === 0) {
    return (
      <div className="flex-1 min-h-0 grid place-items-center">
        <p className="text-[12px] font-(family-name:--app-font) text-white/35">Loading diff…</p>
      </div>
    );
  }

  if (diffs.length === 0) {
    return (
      <div className="flex-1 min-h-0 grid place-items-center p-6">
        <p className="text-[12px] font-(family-name:--app-font) text-white/35 text-center">{placeholder}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto font-mono text-[11.5px] leading-[1.55]">
      {diffs.map((diff) => (
        <FileDiff key={`${diff.path}-${diff.oldPath ?? ''}`} diff={diff} showHeader={diffs.length > 1} />
      ))}
    </div>
  );
};

export default DiffView;
