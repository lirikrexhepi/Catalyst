import React, { useRef } from 'react';
import { LiquidGlass } from '../../liquid-glass';
import { ScrollArea } from '../common/ScrollArea';
import { WallpaperState } from './useWallpaper';
import { isCustom } from './wallpapers';

export interface SettingsPanelProps {
  wallpaper: WallpaperState;
  onClose: () => void;
  className?: string;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  wallpaper,
  onClose,
  className = '',
}) => {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void wallpaper.upload(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
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
      tint="rgba(0, 0, 0, 0.22)"
      shadow="apple"
      border="1px solid rgba(255, 255, 255, 0.18)"
      frost={16}
      frostSaturation={170}
      className={`w-[380px] flex flex-col ${className}`}
      style={{
        boxShadow:
          '0 20px 54px rgba(0, 0, 0, 0.55), 0 4px 14px rgba(0, 0, 0, 0.35), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.25)',
      }}
    >
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 shrink-0">
        <div className="flex items-center gap-2">
          <span className="material-symbols-rounded text-[18px] text-white/80 leading-none">
            settings
          </span>
          <span className="text-[13px] font-semibold font-['Geist'] text-white tracking-tight">
            Settings
          </span>
        </div>
        <button
          type="button"
          title="Close"
          onClick={onClose}
          className="w-[24px] h-[24px] rounded-[7px] hover:bg-white/10 active:scale-90 flex items-center justify-center transition-all duration-150 cursor-pointer text-white/45 hover:text-white/90"
        >
          <span className="material-symbols-rounded text-[16px] leading-none">close</span>
        </button>
      </div>

      <ScrollArea maxHeight={420} className="px-4 pb-4 flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-2 px-0.5">
          <span className="text-[10px] font-semibold font-['Geist'] text-white/45 tracking-tight uppercase">
            Wallpaper
          </span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-[11px] font-medium font-['Geist'] text-white/60 hover:text-white tracking-tight transition-colors cursor-pointer"
          >
            Upload
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => handleFiles(event.target.files)}
        />

        {wallpaper.error && (
          <div className="px-3 py-2 rounded-[9px] bg-amber-500/10 border border-amber-400/25">
            <span className="text-[11px] font-medium font-['Geist'] text-amber-100/90 leading-relaxed">
              {wallpaper.error}
            </span>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          {wallpaper.wallpapers.map((item) => {
            const isSelected = wallpaper.selected?.id === item.id;
            return (
              <div key={item.id} className="relative group">
                <button
                  type="button"
                  title={item.label}
                  onClick={() => wallpaper.select(item.id)}
                  className={`w-full aspect-[16/10] rounded-[9px] overflow-hidden transition-all duration-150 cursor-pointer active:scale-95 ${
                    isSelected
                      ? 'ring-2 ring-inset ring-white/80'
                      : 'ring-1 ring-inset ring-white/15 hover:ring-white/40'
                  }`}
                >
                  <img
                    src={item.url}
                    alt={item.label}
                    loading="lazy"
                    draggable={false}
                    className="w-full h-full object-cover"
                  />
                </button>

                {isCustom(item.id) && (
                  <button
                    type="button"
                    title="Remove"
                    onClick={() => wallpaper.remove(item.id)}
                    className="absolute top-1 right-1 w-[18px] h-[18px] rounded-full bg-black/60 hover:bg-rose-500/80 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-150 cursor-pointer"
                  >
                    <span className="material-symbols-rounded text-[12px] text-white leading-none">
                      close
                    </span>
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {wallpaper.wallpapers.length === 0 && (
          <p className="text-[12px] font-['Geist'] text-white/45 leading-relaxed">
            No wallpapers bundled yet. Upload one, or drop images named
            <span className="font-mono text-white/60"> wallpaper1.png</span> through
            <span className="font-mono text-white/60"> wallpaper6.png</span> into
            <span className="font-mono text-white/60"> src/assets/wallpapers/</span>.
          </p>
        )}
      </ScrollArea>
    </LiquidGlass>
  );
};

export default SettingsPanel;
