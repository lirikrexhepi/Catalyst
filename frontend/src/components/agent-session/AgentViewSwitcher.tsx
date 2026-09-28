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

export const AgentViewSwitcher: React.FC<AgentViewSwitcherProps> = ({ mode, onChange, tasks, servers, changes, isLight }) => {
  const available: { id: AgentCardMode; label: string }[] = [];
  available.push({ id: 'chat', label: 'Chat' });
  if (tasks.total > 0) available.push({ id: 'tasklist', label: `Tasks ${tasks.done}/${tasks.total}` });
  if (servers > 0) {
    available.push({ id: 'browser', label: 'Preview' });
    available.push({ id: 'servers', label: servers > 1 ? `Servers ${servers}` : 'Servers' });
  }
  if (changes > 0) available.push({ id: 'changes', label: `Changes ${changes}` });
  // A lone view needs no switcher at all.
  if (available.length <= 1) return null;

  return (
    <div style={isLight ? LIGHT : DARK} onClick={(e) => e.stopPropagation()} className="shrink-0 pointer-events-auto">
      <MorphButtons
        size={28}
        gap={6}
        anchor="end"
        items={[
          {
            id: 'views',
            label: 'Views',
            icon: <LayoutGrid size={15} strokeWidth={1.75} />,
            actions: available.map((view) =>
              view.id === mode
                ? { id: view.id, label: `✓ ${view.label}`, dismiss: true, onSelect: () => {} }
                : { id: view.id, label: view.label, onSelect: () => onChange(view.id) },
            ),
          },
        ]}
      />
    </div>
  );
};
