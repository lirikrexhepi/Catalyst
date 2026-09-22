import React, { useState } from 'react';
import { renderChatIcon } from '../common/DynamicIsland';
import { useTheme } from '../../themes/ThemeContext';

export interface NoticeDividerProps {
  label: string;
  icon?: string;
  className?: string;
}

function parseSwitchNotice(label: string): { fromDriver?: string; fromModel?: string; toDriver?: string; toModel?: string } | null {
  if (!label.startsWith('Switched from ')) return null;
  const content = label.slice(14);
  const parts = content.split(' to ');
  if (parts.length !== 2) return null;

  const parsePart = (p: string) => {
    const colonIdx = p.indexOf(':');
    if (colonIdx !== -1) {
      return {
        driver: p.slice(0, colonIdx).trim(),
        model: p.slice(colonIdx + 1).trim(),
      };
    }
    return { driver: p.trim(), model: '' };
  };

  const from = parsePart(parts[0]);
  const to = parsePart(parts[1]);
  return {
    fromDriver: from.driver,
    fromModel: from.model,
    toDriver: to.driver,
    toModel: to.model,
  };
}

/**
 * Centered rule marking a change in the conversation, such as switching model.
 * The rules are flex children rather than a background line so the label always
 * sits flush between them at any width.
 */
const NoticeDividerImpl: React.FC<NoticeDividerProps> = ({ label, icon, className = '' }) => {
  const [imgError, setImgError] = useState(false);
  const { currentTheme } = useTheme();
  const isLight = currentTheme.id === 'light' || currentTheme.id === 'white';

  const switchData = parseSwitchNotice(label);

  return (
    <div className={`flex items-center gap-2.5 py-1 select-none ${className}`}>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-white/20" />

      <span className="inline-flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06]">
        {switchData ? (
          <span className="flex items-center gap-1.5 shrink-0">
            {renderChatIcon(switchData.fromDriver, switchData.fromModel, isLight, 'w-3.5 h-3.5')}
            <span className="text-[10px] text-white/35 font-mono">→</span>
            {renderChatIcon(switchData.toDriver, switchData.toModel, isLight, 'w-3.5 h-3.5')}
          </span>
        ) : icon && !imgError && (icon.startsWith('http') || icon.startsWith('data:') || icon.startsWith('/')) ? (
          <img
            src={icon}
            alt=""
            onError={() => setImgError(true)}
            className="w-3.5 h-3.5 object-contain"
            draggable={false}
          />
        ) : (
          <span className="material-symbols-outlined text-[13px] leading-none text-white/35">
            swap_horiz
          </span>
        )}
        <span className="text-[11px] font-medium font-['Geist'] text-white/55 tracking-tight whitespace-nowrap">
          {label}
        </span>
      </span>

      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-white/20" />
    </div>
  );
};

export const NoticeDivider = React.memo(NoticeDividerImpl);
NoticeDivider.displayName = 'NoticeDivider';

export default NoticeDivider;
