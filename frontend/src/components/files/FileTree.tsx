import React, { memo } from 'react';
import { ChevronRight } from 'lucide-react';
import { fileIconUrl, folderIconUrl } from 'virtual:file-icons';
import { files } from '../../../wailsjs/go/models';
import { ProjectTreeState } from './useProjectTree';
import { STATUS_STYLE } from './status';

export interface FileTreeProps {
  tree: ProjectTreeState;
  selected: string | null;
  onSelect: (entry: files.Entry) => void;
}

const INDENT = 12;

interface RowProps {
  entry: files.Entry;
  depth: number;
  open: boolean;
  selected: boolean;
  status?: string;
  onClick: () => void;
}

const Row = memo<RowProps>(({ entry, depth, open, selected, status, onClick }) => {
  const style = status ? STATUS_STYLE[status] : undefined;
  const nameTone = style ? style.tone : entry.ignored ? 'text-white/35' : 'text-white/80';
  return (
    <button
      type="button"
      title={style ? `${entry.path} · ${style.label}` : entry.path}
      onClick={onClick}
      className={`w-full h-[24px] flex items-center gap-1.5 pr-2 rounded-[6px] text-left transition-colors cursor-pointer ${
        selected ? 'bg-white/15' : 'hover:bg-white/[0.06]'
      }`}
      style={{ paddingLeft: 4 + depth * INDENT }}
    >
      <span className="w-[14px] shrink-0 flex items-center justify-center text-white/40">
        {entry.dir && (
          <ChevronRight size={13} className={`transition-transform duration-150 ${open ? 'rotate-90' : ''}`} />
        )}
      </span>
      <img
        src={entry.dir ? folderIconUrl(entry.name, open) : fileIconUrl(entry.name)}
        alt=""
        draggable={false}
        className={`w-[16px] h-[16px] shrink-0 ${entry.ignored ? 'opacity-50' : ''}`}
      />
      <span className={`flex-1 min-w-0 truncate text-[12px] font-['Geist'] tracking-tight ${nameTone}`}>
        {entry.name}
      </span>
      {style &&
        (entry.dir ? (
          // Folders get a dot, as in VS Code: the letter belongs to files.
          <span className={`w-[6px] h-[6px] rounded-full shrink-0 bg-current ${style.tone}`} />
        ) : (
          <span className={`text-[10.5px] font-mono font-bold shrink-0 ${style.tone}`}>{style.mark}</span>
        ))}
    </button>
  );
});
Row.displayName = 'FileTreeRow';

/**
 * A VS Code-style explorer: lazily opened folders, Material icons, and git
 * decorations — modified files in amber with M, new ones in green with U or A,
 * and a dot on every folder that holds a change.
 */
export const FileTree: React.FC<FileTreeProps> = ({ tree, selected, onSelect }) => {
  const { children, expanded, status, loading } = tree;

  const rows: React.ReactNode[] = [];
  const walk = (dir: string, depth: number) => {
    for (const entry of children[dir] ?? []) {
      const open = entry.dir && expanded.has(entry.path);
      rows.push(
        <Row
          key={entry.path}
          entry={entry}
          depth={depth}
          open={open}
          selected={selected === entry.path}
          status={entry.dir ? status?.dirs?.[entry.path] : status?.files?.[entry.path]}
          onClick={() => (entry.dir ? tree.toggle(entry.path) : onSelect(entry))}
        />,
      );
      if (open) {
        if (loading.has(entry.path) && !children[entry.path]) {
          rows.push(
            <div
              key={`${entry.path}/…`}
              className="h-[22px] flex items-center text-[11px] text-white/30 font-['Geist']"
              style={{ paddingLeft: 22 + (depth + 1) * INDENT }}
            >
              Loading…
            </div>,
          );
        }
        walk(entry.path, depth + 1);
      }
    }
  };
  walk('', 0);

  if (tree.error && rows.length === 0) {
    return <p className="p-3 text-[11.5px] font-['Geist'] text-red-200/80 leading-relaxed">{tree.error}</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="p-3 text-[11.5px] font-['Geist'] text-white/35">
        {loading.size > 0 ? 'Loading files…' : 'This folder is empty.'}
      </p>
    );
  }
  return <div className="flex flex-col py-0.5">{rows}</div>;
};

export default FileTree;
