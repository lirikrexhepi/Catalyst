import React from 'react';
import { X, ArrowUpRight } from '../common/icons';
import { WallpaperState } from './useWallpaper';
import { DefaultModels } from './useDefaultModels';
import { useTheme } from '../../themes';
import { useRemoteAccess } from './useRemoteAccess';
import { SectionLabel, SettingsGroup, SettingsRow, Switch, ThemePicker, useGeneralToggles } from './SettingsParts';

export interface SettingsPanelProps {
  wallpaper: WallpaperState;
  defaultModels: DefaultModels;
  onClose: () => void;
  onOpenAll?: () => void;
  className?: string;
}

function PhoneAccessRow({ isLight }: { isLight: boolean }) {
  const { info, loading, toggle } = useRemoteAccess(true);
  const live = Boolean(info?.enabled);
  const hint = !live
    ? 'Off'
    : info?.error
      ? "Couldn't connect"
      : info?.connecting || info?.downloading || !info?.bestUrl
        ? 'Connecting…'
        : info.activeClients > 0
          ? `${info.activeClients} connected`
          : 'Ready to pair';
  return (
    <SettingsRow
      title="Phone access"
      hint={hint}
      isLight={isLight}
      control={<Switch on={live} onChange={() => !loading && void toggle(!live)} isLight={isLight} label="Phone access" />}
    />
  );
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ wallpaper, onClose, onOpenAll, className = '' }) => {
  const { currentTheme } = useTheme();
  const isLight = currentTheme.id === 'light' || currentTheme.id === 'white';
  const toggles = useGeneralToggles();
  const fg = isLight ? 'text-black/90' : 'text-white';

  return (
    <div className={`w-full h-full flex flex-col select-none font-(family-name:--app-font) ${className}`}>
      <div className="flex items-center justify-between px-4 pt-3.5 pb-1 shrink-0">
        <span className={`text-[13px] font-semibold tracking-tight ${fg}`}>Settings</span>
        <button
          type="button"
          title="Close"
          onClick={onClose}
          className={`w-[26px] h-[26px] rounded-full active:scale-90 flex items-center justify-center transition-all duration-150 cursor-pointer ${
            isLight ? 'hover:bg-black/[0.06] text-black/45 hover:text-black' : 'hover:bg-white/10 text-white/45 hover:text-white'
          }`}
        >
          <X size={15} strokeWidth={1.9} />
        </button>
      </div>

      <div className="flex-1 min-h-0 px-4 pt-1 flex flex-col gap-3 overflow-y-auto">
        <div className="flex flex-col gap-1.5">
          <SectionLabel isLight={isLight}>Theme</SectionLabel>
          <ThemePicker isLight={isLight} />
        </div>

        <SettingsGroup title="Quick" isLight={isLight}>
          <SettingsRow
            title="Auto-approve permissions"
            isLight={isLight}
            control={<Switch on={toggles.autoApprove.on} onChange={toggles.autoApprove.toggle} isLight={isLight} label="Auto-approve permissions" />}
          />
          <SettingsRow
            title="Interface sounds"
            isLight={isLight}
            control={<Switch on={toggles.sounds.on} onChange={toggles.sounds.toggle} isLight={isLight} label="Interface sounds" />}
          />
          <PhoneAccessRow isLight={isLight} />
        </SettingsGroup>

        {wallpaper.wallpapers.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <SectionLabel isLight={isLight}>Wallpaper</SectionLabel>
            <div className="grid grid-cols-4 gap-1.5">
              {wallpaper.wallpapers.slice(0, 4).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  title={item.label}
                  onClick={() => wallpaper.select(item.id)}
                  className={`aspect-[16/10] rounded-[9px] overflow-hidden cursor-pointer active:scale-95 transition-all duration-150 ${
                    wallpaper.selected?.id === item.id
                      ? isLight
                        ? 'ring-2 ring-inset ring-black/80'
                        : 'ring-2 ring-inset ring-white/80'
                      : isLight
                        ? 'ring-1 ring-inset ring-black/15'
                        : 'ring-1 ring-inset ring-white/15'
                  }`}
                >
                  <img src={item.url} alt="" loading="lazy" draggable={false} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="p-3 shrink-0">
        <button
          type="button"
          onClick={onOpenAll}
          className={`w-full h-[38px] rounded-[12px] flex items-center justify-center gap-1.5 text-[12.5px] font-medium tracking-tight transition-all duration-150 cursor-pointer active:scale-[0.98] ${
            isLight ? 'bg-black/[0.06] hover:bg-black/[0.1] text-black/85' : 'bg-white/[0.08] hover:bg-white/[0.13] text-white/90'
          }`}
        >
          All settings
          <ArrowUpRight size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
};

export default SettingsPanel;
