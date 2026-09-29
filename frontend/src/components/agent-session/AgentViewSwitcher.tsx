import React from 'react';
import { LayoutGrid } from 'lucide-react';
import { MorphButtons } from '../../liquid-morph/glass/MorphButtons';
import type { AgentCardMode } from './AgentWindow';

interface AgentViewSwitcherProps {
  mode: AgentCardMode;
  onChange: (mode: AgentCardMode) => void;
  tasks: { done: number; total: number };
  servers: number;
  changes: number;
  isLight: boolean;
}

const DARK = {
  '--ma-fill': '#2a2a2a',
  '--ma-hover': '#363636',
  '--ma-fg': 'rgba(255,255,255,0.92)',
  '--ma-rim': '#ffffff',
  '--ma-rim-hi': '0.55',
  '--ma-rim-lo': '0.06',
  '--font': "'Geist', system-ui, sans-serif",
} as React.CSSProperties;

const LIGHT = {
  '--ma-fill': '#ffffff',
  '--ma-hover': '#efeff2',
  '--ma-fg': '#111111',
  '--ma-rim': '#000000',
  '--ma-rim-hi': '0.12',
  '--ma-rim-lo': '0.05',
  '--ma-shadow': '0.05',
  '--font': "'Geist', system-ui, sans-serif",
} as React.CSSProperties;

const pillIcon = (inner: string) =>
  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const ICONS: Record<AgentCardMode, string> = {
  chat: pillIcon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  tasklist: pillIcon('<rect x="3" y="5" width="6" height="6" rx="1"/><path d="m3 17 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>'),
  browser: pillIcon('<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>'),
  servers: pillIcon('<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>'),
  changes: pillIcon('<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>'),
};

export const AgentViewSwitcher: React.FC<AgentViewSwitcherProps> = ({ mode, onChange, tasks, servers, changes, isLight }) => {
  const available = React.useMemo(() => {
    const views: { id: AgentCardMode; label: string }[] = [{ id: 'chat', label: 'Chat' }];
    if (tasks.total > 0) views.push({ id: 'tasklist', label: `Tasks ${tasks.done}/${tasks.total}` });
    if (servers > 0) {
      views.push({ id: 'browser', label: 'Preview' });
      views.push({ id: 'servers', label: servers > 1 ? `Servers ${servers}` : 'Servers' });
    }
    if (changes > 0) views.push({ id: 'changes', label: `Changes ${changes}` });
    return views;
  }, [tasks.done, tasks.total, servers, changes]);

  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  const items = React.useMemo(
    () => [
      {
        id: 'views',
        label: 'Views',
        icon: <LayoutGrid size={15} strokeWidth={1.75} />,
        actions: available.map((view) => ({
          id: view.id,
          label: view.label,
          icon: ICONS[view.id],
          selected: view.id === mode,
          dismiss: view.id === mode,
          onSelect: () => onChangeRef.current(view.id),
        })),
      },
    ],
    [available, mode],
  );

  return (
    <div style={isLight ? LIGHT : DARK} onClick={(e) => e.stopPropagation()} className="shrink-0 pointer-events-auto">
      <MorphButtons size={28} gap={6} anchor="end" items={items} />
    </div>
  );
};
