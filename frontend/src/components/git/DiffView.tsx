import React from 'react';
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

const Row: React.FC<{ line: domain.DiffLine }> = ({ line }) => (
  <div className={`flex ${ROW_TONES[line.kind] ?? ''}`}>
    <Gutter value={line.old ?? 0} />
    <Gutter value={line.new ?? 0} />
    <span className={`w-[14px] shrink-0 select-none ${TEXT_TONES[line.kind] ?? ''}`}>
      {MARKERS[line.kind] ?? ' '}
    </span>
    {/* Tabs and runs of spaces carry meaning in code, so the row preserves
        whitespace and scrolls sideways rather than wrapping mid-token. */}
    <span className={`whitespace-pre flex-1 ${TEXT_TONES[line.kind] ?? ''}`}>
      {line.content || ' '}
    </span>
  </div>
);

const FileDiff: React.FC<{ diff: domain.DiffFile; showHeader: boolean }> = ({
  diff,
  showHeader,
}) => (
  <div className="flex flex-col">
    {showHeader && (
      <div className="sticky top-0 z-10 flex items-baseline gap-2 px-3 py-1.5 bg-[#15171c]/95 border-b border-white/[0.07] backdrop-blur-sm">
        <span className="text-[11.5px] font-medium font-['Geist'] text-white/80 tracking-tight truncate">
          {diff.oldPath ? `${diff.oldPath} → ${diff.path}` : diff.path}
        </span>
        <span className="text-[10.5px] font-['Geist'] tabular-nums shrink-0 ml-auto">
          <span className="text-emerald-300/80">+{diff.insertions}</span>{' '}
          <span className="text-rose-300/80">−{diff.deletions}</span>
        </span>
      </div>
    )}

    {diff.binary ? (
      <p className="px-3 py-3 text-[12px] font-['Geist'] text-white/40">Binary file — no preview.</p>
    ) : (
      (diff.hunks ?? []).map((hunk, index) => (
        <div key={`${diff.path}-${index}`} className="flex flex-col">
          <div className="px-3 py-1 bg-white/[0.04] text-[10.5px] font-mono text-white/35 whitespace-pre truncate">
            {hunk.header}
          </div>
          {(hunk.lines ?? []).map((line, row) => (
            <Row key={row} line={line} />
          ))}
        </div>
      ))
    )}

    {diff.truncated && (
      <p className="px-3 py-2 text-[11px] font-['Geist'] text-amber-300/70">
        Diff truncated — the file is too large to show in full.
      </p>
    )}

    {!diff.binary && !diff.truncated && (diff.hunks?.length ?? 0) === 0 && (
      <p className="px-3 py-3 text-[12px] font-['Geist'] text-white/40">
        No textual changes — this may be a mode or permission change.
      </p>
    )}
  </div>
);

/** The right-hand pane: one file's diff, or every file a commit touched. */
export const DiffView: React.FC<DiffViewProps> = ({ diffs, isLoading, error, placeholder }) => {
  if (error) {
    return (
      <div className="flex-1 min-h-0 grid place-items-center p-6">
        <p className="text-[12px] font-['Geist'] text-red-200/80 text-center leading-relaxed max-w-[320px]">
          {error}
        </p>
      </div>
    );
  }

  if (isLoading && diffs.length === 0) {
    return (
      <div className="flex-1 min-h-0 grid place-items-center">
        <p className="text-[12px] font-['Geist'] text-white/35">Loading diff…</p>
      </div>
    );
  }

  if (diffs.length === 0) {
    return (
      <div className="flex-1 min-h-0 grid place-items-center p-6">
        <p className="text-[12px] font-['Geist'] text-white/35 text-center">{placeholder}</p>
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
