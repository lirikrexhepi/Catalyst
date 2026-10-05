import { MaterialIcon } from '../common/icons';
import React, { useEffect, useRef, useState } from 'react';
import { Chevron, Collapse, OutputPanel, WorkRow } from './WorkRow';
import { ROW_DOT_Y, TimelineDot, useInTimeline } from './Timeline';
import { TextShimmer } from './TextShimmer';

export interface ToolGroupItem {
  id?: string;
  type: 'read' | 'bash' | 'search' | 'edit' | 'write' | 'git' | 'generic';
  action: string;
  target: string;
  details?: string;
  status?: 'running' | 'completed' | 'error';
}

export interface ToolGroupProps {
  title?: string;
  summary?: string;
  items: ToolGroupItem[];
  defaultExpanded?: boolean;
  className?: string;
}

const ICONS: Record<ToolGroupItem['type'], string> = {
  read: 'search',
  search: 'search',
  bash: 'terminal',
  git: 'commit',
  edit: 'edit',
  write: 'edit_document',
  generic: 'build',
};

const FILE_TYPES = new Set<ToolGroupItem['type']>(['read', 'edit', 'write']);

function displayTarget(item: ToolGroupItem): string {
  const target = item.target.trim();
  if (!target) return '';
  if (FILE_TYPES.has(item.type)) {
    const base = target.split(/[\\/]/).filter(Boolean).pop();
    return base || target;
  }
  const line = target.split('\n').find((candidate) => candidate.trim()) || target;
  return line.trim();
}

const PRESENT: Record<string, string> = {
  Read: 'Reading',
  Ran: 'Running',
  Inspect: 'Inspecting',
  Glob: 'Searching',
  Grep: 'Searching',
  Search: 'Searching',
  Fetch: 'Fetching',
  Edit: 'Editing',
  Write: 'Writing',
};

export const ToolItemRow = React.memo(function ToolItemRow({ item }: { item: ToolGroupItem }) {
  const details = item.details?.trim();
  const running = item.status === 'running';
  return (
    <WorkRow
      icon={ICONS[item.type]}
      label={running ? PRESENT[item.action] ?? item.action : item.action}
      target={displayTarget(item)}
      running={running}
      error={item.status === 'error'}
    >
      {details ? <OutputPanel text={details} /> : undefined}
    </WorkRow>
  );
});

const COLLAPSE_AT = 4;

const ToolGroupImpl: React.FC<ToolGroupProps> = ({ items = [], defaultExpanded, className = '' }) => {
  const inTimeline = useInTimeline();
  const anyRunning = items.some((item) => item.status === 'running');
  const [open, setOpen] = useState(defaultExpanded ?? anyRunning);
  const touched = useRef(false);

  useEffect(() => {
    if (touched.current) return;
    setOpen(anyRunning);
  }, [anyRunning]);

  if (items.length < COLLAPSE_AT) {
    return (
      <div className={`flex flex-col ${className}`}>
        {items.map((item, index) => (
          <ToolItemRow key={item.id || index} item={item} />
        ))}
      </div>
    );
  }

  const label = `Used ${items.length} tools`;
  return (
    <div className={`relative flex flex-col font-(family-name:--app-font) ${className}`}>
      {inTimeline && <TimelineDot y={ROW_DOT_Y} tone={anyRunning ? 'running' : 'row'} />}
      <button
        type="button"
        onClick={() => {
          touched.current = true;
          setOpen((value) => !value);
        }}
        className="group/work flex items-center gap-2 self-start py-[3px] text-[12.5px] tracking-tight leading-[18px] text-current/55 hover:text-current/85 transition-colors duration-150 cursor-pointer"
      >
        {anyRunning ? <TextShimmer duration={1.6}>{label}</TextShimmer> : <span>{label}</span>}
        <Chevron open={open} direction="down" />
      </button>
      <Collapse open={open}>
        <div className="flex flex-col">
          {items.map((item, index) => (
            <ToolItemRow key={item.id || index} item={item} />
          ))}
        </div>
      </Collapse>
    </div>
  );
};

export const ToolGroup = React.memo(ToolGroupImpl);
ToolGroup.displayName = 'ToolGroup';

export default ToolGroup;
