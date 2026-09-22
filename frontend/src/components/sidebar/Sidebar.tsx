import React from 'react';
import { LiquidGlass } from '../../liquid-glass';

import { useTheme } from '../../themes';

export type SidebarPanel = 'settings';

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
  { id: 'settings', icon: 'settings', label: 'Settings' },
];

export const Sidebar: React.FC<SidebarProps> = ({ activePanel, onSelect, className = '' }) => {
  const { currentTheme } = useTheme();
  const isLight = currentTheme.id === 'light' || currentTheme.id === 'white';

  return (
    <LiquidGlass
      variant="panel"
      surface="squircle"
      radius={20}
      bezelWidth={18}
      glassThickness={24}
      refractionScale={0.8}
      blur={0.4}
      specularOpacity={isLight ? 0.3 : 0.8}
      specularSaturation={6}
      lightAngle={-45}
      tint="var(--theme-panel-bg, rgba(3, 3, 3, 0.94))"
      shadow={isLight ? 'subtle' : 'apple'}
      border="1px solid var(--theme-panel-border, rgba(255, 255, 255, 0.10))"
      frost={14}
      frostSaturation={170}
      className={`w-[52px] py-2.5 px-[6px] flex flex-col items-stretch gap-1 ${className}`}
      style={{
        boxShadow: isLight
          ? '0 18px 40px rgba(0, 0, 0, 0.10), 0 3px 12px rgba(0, 0, 0, 0.05), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.8)'
          : '0 20px 54px rgba(0, 0, 0, 0.55), 0 4px 14px rgba(0, 0, 0, 0.35), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.25)',
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
          <span
            className="material-symbols-rounded text-[20px] leading-none block"
            style={{
              fontVariationSettings: `'FILL' ${isActive ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 20`,
            }}
          >
            {item.icon}
          </span>
        </button>
      );
    })}
    </LiquidGlass>
  );
};

export default Sidebar;
