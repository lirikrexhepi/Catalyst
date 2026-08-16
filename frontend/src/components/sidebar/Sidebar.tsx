import React from 'react';
import { LiquidGlass } from '../../liquid-glass';
import { GithubMark } from './GithubMark';

export type SidebarPanel = 'history' | 'terminal' | 'browser' | 'github' | 'usage' | 'settings';

export interface SidebarProps {
  activePanel: SidebarPanel | null;
  onSelect: (panel: SidebarPanel) => void;
  className?: string;
}

interface SidebarItem {
  id: SidebarPanel;
  icon: string;
  label: string;
}

const ITEMS: SidebarItem[] = [
  { id: 'history', icon: 'history', label: 'History' },
  { id: 'terminal', icon: 'terminal', label: 'Terminal' },
  { id: 'browser', icon: 'globe', label: 'Browser' },
  { id: 'github', icon: '', label: 'GitHub' },
  { id: 'usage', icon: 'speed', label: 'Usage' },
  { id: 'settings', icon: 'settings', label: 'Settings' },
];

export const Sidebar: React.FC<SidebarProps> = ({ activePanel, onSelect, className = '' }) => (
  <LiquidGlass
    variant="panel"
    surface="squircle"
    radius={20}
    bezelWidth={18}
    glassThickness={24}
    refractionScale={0.8}
    blur={0.4}
    specularOpacity={0.8}
    specularSaturation={6}
    lightAngle={-45}
    tint="rgba(0, 0, 0, 0.20)"
    shadow="apple"
    border="1px solid rgba(255, 255, 255, 0.18)"
    frost={14}
    frostSaturation={170}
    className={`w-[52px] py-2.5 px-[6px] flex flex-col items-stretch gap-1 ${className}`}
    style={{
      boxShadow:
        '0 20px 54px rgba(0, 0, 0, 0.55), 0 4px 14px rgba(0, 0, 0, 0.35), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.25)',
    }}
  >
    {ITEMS.map((item) => {
      const isActive = activePanel === item.id;
      return (
        <button
          key={item.id}
          type="button"
          title={item.label}
          aria-label={item.label}
          aria-pressed={isActive}
          onClick={() => onSelect(item.id)}
          className={`relative h-[38px] w-full rounded-[11px] grid place-items-center transition-all duration-150 cursor-pointer active:scale-90 ${
            isActive
              ? 'bg-white/20 ring-1 ring-inset ring-white/25 text-white'
              : 'text-white/55 hover:text-white hover:bg-white/10'
          }`}
        >
          {/* grid place-items-center centres the child box, and an inset ring is
              used instead of a border so the active state cannot shift the glyph
              by the border width. */}
          {item.id === 'github' ? (
            <GithubMark size={19} className="block" />
          ) : (
            <span
              className="material-symbols-rounded text-[20px] leading-none block"
              style={{
                fontVariationSettings: `'FILL' ${isActive ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 20`,
              }}
            >
              {item.icon}
            </span>
          )}
        </button>
      );
    })}
  </LiquidGlass>
);

export default Sidebar;
