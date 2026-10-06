import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MaterialIcon } from '../common/icons';
import { MarkdownText } from './MarkdownText';
import { OrbitLoader } from './OrbitLoader';
import { SubagentBlockData, SubagentEntry } from './types';

export interface SubagentDockProps {
  agents: SubagentBlockData[];
}

const PANEL_MAX_WIDTH = 600;

const TOOL_ICONS: Record<string, string> = {
  read: 'search',
  glob: 'search',
  grep: 'search',
  websearch: 'search',
  webfetch: 'language',
  bash: 'terminal',
  powershell: 'terminal',
  edit: 'edit',
  write: 'edit_document',
  notebookedit: 'edit_document',
  todowrite: 'checklist',
  task: 'smart_toy',
  agent: 'smart_toy',
};

const SPRING = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 } as const;

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  return `${minutes}m ${String(total % 60).padStart(2, '0')}s`;
}

function elapsedOf(agent: SubagentBlockData, now: number): string {
  if (!agent.startedAt) return '';
  const end = agent.status === 'running' ? now : (agent.endedAt ?? now);
  return formatElapsed(end - agent.startedAt);
}

function toolCount(agent: SubagentBlockData): number {
  return agent.entries.filter((entry) => entry.kind === 'tool').length;
}

function baseName(target: string): string {
  const line = target.split('\n')[0];
  if (line.includes(' ')) return line;
  const parts = line.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? line;
}

function currentActivity(agent: SubagentBlockData): string {
  for (let i = agent.entries.length - 1; i >= 0; i--) {
    const entry = agent.entries[i];
    if (entry.kind === 'tool') return `${entry.name}${entry.target ? ` ${baseName(entry.target)}` : ''}`;
  }
  return agent.agentType || 'Starting';
}

const StatusMark: React.FC<{ status: SubagentBlockData['status']; size?: number }> = ({ status, size = 13 }) => {
  if (status === 'running') return <OrbitLoader size={size} />;
  const tone =
    status === 'completed' ? 'text-emerald-300/90' : status === 'error' ? 'text-rose-300/90' : 'text-white/40';
  const icon = status === 'completed' ? 'check_circle' : status === 'error' ? 'error' : 'block';
  return (
    <span className={`inline-flex ${tone}`}>
      <MaterialIcon name={icon} size={size + 1} />
    </span>
  );
};

const Chip: React.FC<{
  agent: SubagentBlockData;
  now: number;
  selected: boolean;
  onSelect: (element: HTMLElement) => void;
}> = ({ agent, now, selected, onSelect }) => {
  const running = agent.status === 'running';
  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, scale: 0.85, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={SPRING}
      whileTap={{ scale: 0.95 }}
      onClick={(event) => onSelect(event.currentTarget)}
      title={agent.prompt ? agent.prompt.slice(0, 280) : agent.title}
      className={`pointer-events-auto relative h-[40px] w-[148px] shrink-0 overflow-hidden rounded-[11px] border px-2.5 text-left backdrop-blur-md shadow-lg transition-colors cursor-pointer ${
        selected ? 'bg-white/[0.14] border-white/35' : 'bg-black/40 hover:bg-black/55 border-white/15'
      }`}
    >
      <div className="relative flex items-center gap-1.5">
        <StatusMark status={agent.status} size={11} />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-white/90 font-(family-name:--app-font) tracking-tight">
          {agent.title}
        </span>
      </div>
      <div className="relative mt-0.5 flex items-center gap-1 text-[9.5px] text-white/45 font-(family-name:--app-font) tabular-nums">
        <span className="min-w-0 flex-1 truncate">
          {running ? currentActivity(agent) : agent.agentType || 'Subagent'}
        </span>
        <span className="shrink-0">
          {toolCount(agent)} · {elapsedOf(agent, now)}
        </span>
      </div>
    </motion.button>
  );
};

const EntryRow: React.FC<{ entry: SubagentEntry }> = ({ entry }) => {
  if (entry.kind === 'text') {
    return (
      <div className="text-[12px] leading-relaxed text-white/85 select-text pl-0.5">
        <MarkdownText content={entry.text} />
      </div>
    );
  }
  const icon = TOOL_ICONS[entry.name.toLowerCase()] || 'build';
  const tone =
    entry.status === 'error' ? 'text-rose-300/80' : entry.status === 'running' ? 'text-white/80' : 'text-white/40';
  return (
    <div className={`flex items-center gap-2 text-[11.5px] font-(family-name:--app-font) ${tone}`}>
      <span className="shrink-0 inline-flex">
        {entry.status === 'running' ? <OrbitLoader size={11} /> : <MaterialIcon name={icon} size={13} />}
      </span>
      <span className="shrink-0 font-medium">{entry.name}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] opacity-80">{entry.target.split('\n')[0]}</span>
    </div>
  );
};

const STATUS_LABEL: Record<SubagentBlockData['status'], string> = {
  running: 'Working',
  completed: 'Done',
  error: 'Failed',
  stopped: 'Stopped',
};

const Transcript: React.FC<{
  agent: SubagentBlockData;
  now: number;
  originX: number;
  onClose: () => void;
}> = ({ agent, now, originX, onClose }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [briefOpen, setBriefOpen] = useState(false);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [agent.entries, agent.result, agent.status]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const meta = [agent.agentType, STATUS_LABEL[agent.status], `${toolCount(agent)} tool calls`, elapsedOf(agent, now)]
    .filter(Boolean)
    .join(' · ');

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7, y: 14 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: 10 }}
      transition={SPRING}
      style={{ transformOrigin: `${originX}px 100%`, width: `min(${PANEL_MAX_WIDTH}px, calc(100vw - 48px))` }}
      className="pointer-events-auto absolute bottom-full left-1/2 mb-2 flex h-[360px] -translate-x-1/2 flex-col overflow-hidden rounded-[18px] border border-white/15 bg-black/70 shadow-2xl backdrop-blur-xl"
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-3.5 py-2.5">
        <StatusMark status={agent.status} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-medium text-white/90 font-(family-name:--app-font)">
            {agent.title}
          </div>
          <div className="truncate text-[10.5px] text-white/40 font-(family-name:--app-font) tabular-nums">{meta}</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Close (Esc)"
          className="flex h-6 w-6 items-center justify-center rounded-full text-white/50 hover:bg-white/15 hover:text-white cursor-pointer"
        >
          <MaterialIcon name="close" size={14} />
        </button>
      </div>
      <div
        ref={scrollRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 28;
        }}
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3.5 py-3"
      >
        <div className="flex flex-col gap-2.5">
          {agent.prompt && (
            <button
              type="button"
              onClick={() => setBriefOpen((value) => !value)}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-left cursor-pointer"
            >
              <div className="text-[9.5px] uppercase tracking-wider text-white/35 font-(family-name:--app-font)">
                Brief
              </div>
              <div
                className={`mt-0.5 whitespace-pre-wrap text-[11.5px] leading-relaxed text-white/60 ${
                  briefOpen ? '' : 'line-clamp-2'
                }`}
              >
                {agent.prompt}
              </div>
            </button>
          )}
          {agent.entries.length === 0 && agent.status === 'running' && (
            <div className="text-[11.5px] text-white/40 font-(family-name:--app-font)">Waiting for the first step…</div>
          )}
          {agent.entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} />
          ))}
          {agent.result && agent.status !== 'running' && (
            <div className="mt-1 rounded-lg border border-emerald-300/15 bg-emerald-300/[0.05] px-2.5 py-2">
              <div className="text-[9.5px] uppercase tracking-wider text-emerald-200/50 font-(family-name:--app-font)">
                Result
              </div>
              <div className="mt-0.5 text-[12px] leading-relaxed text-white/85 select-text">
                <MarkdownText content={agent.result} />
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export const SubagentDock: React.FC<SubagentDockProps> = ({ agents }) => {
  const [openId, setOpenId] = useState<string | null>(null);
  const [originX, setOriginX] = useState(PANEL_MAX_WIDTH / 2);
  const rowRef = useRef<HTMLDivElement>(null);
  const now = useNow(agents.some((agent) => agent.status === 'running'));
  const open = useMemo(() => agents.find((agent) => agent.id === openId) ?? null, [agents, openId]);

  useEffect(() => {
    if (openId && !open) setOpenId(null);
  }, [openId, open]);

  const select = (agent: SubagentBlockData, chip: HTMLElement) => {
    if (openId === agent.id) {
      setOpenId(null);
      return;
    }
    const row = rowRef.current;
    if (row) {
      const rowBox = row.getBoundingClientRect();
      const chipBox = chip.getBoundingClientRect();
      const panelWidth = Math.min(PANEL_MAX_WIDTH, window.innerWidth - 48);
      const chipCenter = chipBox.left + chipBox.width / 2 - rowBox.left;
      setOriginX(Math.max(0, Math.min(panelWidth, chipCenter - (rowBox.width / 2 - panelWidth / 2))));
    }
    setOpenId(agent.id);
  };

  if (agents.length === 0) return null;

  return (
    <div className="relative flex w-full justify-center" ref={rowRef}>
      <AnimatePresence>
        {open && <Transcript key={open.id} agent={open} now={now} originX={originX} onClose={() => setOpenId(null)} />}
      </AnimatePresence>
      <motion.div layout className="flex max-w-full flex-wrap items-center justify-center gap-1.5">
        <AnimatePresence initial={false}>
          {agents.map((agent) => (
            <Chip
              key={agent.id}
              agent={agent}
              now={now}
              selected={agent.id === openId}
              onSelect={(chip) => select(agent, chip)}
            />
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
