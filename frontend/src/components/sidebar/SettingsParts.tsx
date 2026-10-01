import React, { useEffect, useRef, useState } from 'react';
import { WallpaperState } from './useWallpaper';
import { isCustom } from './wallpapers';
import { useTheme } from '../../themes';
import { useOrchestratorStore } from '../orchestrator/useOrchestratorStore';
import { GetUserPreference, SetUserPreference } from '../../../wailsjs/go/main/App';

export function Switch({ on, onChange, isLight, label }: { on: boolean; onChange: () => void; isLight: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 ease-out cursor-pointer shrink-0 ${
        on ? (isLight ? 'bg-[#007AFF]' : 'bg-white/90') : isLight ? 'bg-black/15' : 'bg-white/15'
      }`}
    >
      <div
        className={`w-4 h-4 rounded-full transition-transform duration-200 ease-out ${
          on
            ? isLight
              ? 'translate-x-4 bg-white shadow-sm'
              : 'translate-x-4 bg-black shadow-sm'
            : isLight
              ? 'translate-x-0 bg-white shadow-sm'
              : 'translate-x-0 bg-white/60'
        }`}
      />
    </button>
  );
}

export function ToggleRow({
  title,
  hint,
  on,
  onChange,
  isLight,
  children,
}: {
  title: string;
  hint?: string;
  on: boolean;
  onChange: () => void;
  isLight: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 px-3 py-2.5 rounded-[12px] ${isLight ? 'bg-black/[0.04]' : 'bg-white/[0.04]'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col min-w-0">
          <span className={`text-[12.5px] font-medium tracking-tight ${isLight ? 'text-black/90' : 'text-white/90'}`}>{title}</span>
          {hint && (
            <span className={`text-[11px] tracking-tight leading-snug ${isLight ? 'text-black/50' : 'text-white/40'}`}>{hint}</span>
          )}
        </div>
        <Switch on={on} onChange={onChange} isLight={isLight} label={title} />
      </div>
      {children}
    </div>
  );
}

export function SectionLabel({ children, isLight, action }: { children: React.ReactNode; isLight: boolean; action?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-0.5 pt-1">
      <span className={`text-[11px] font-medium tracking-tight ${isLight ? 'text-black/45' : 'text-white/40'}`}>{children}</span>
      {action}
    </div>
  );
}

export function ThemePicker({ isLight }: { isLight: boolean }) {
  const { themeId, availableThemes, setTheme } = useTheme();
  return (
    <div className="grid grid-cols-3 gap-2">
      {availableThemes.map((t) => {
        const selected = t.id === themeId;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTheme(t.id)}
            className={`h-[34px] px-2.5 rounded-[11px] flex items-center gap-2 transition-all duration-150 cursor-pointer active:scale-95 ${
              selected
                ? isLight
                  ? 'bg-black/10 text-black ring-1 ring-black/10'
                  : 'bg-white/[0.16] text-white'
                : isLight
                  ? 'bg-black/[0.04] hover:bg-black/[0.07] text-black/70'
                  : 'bg-white/[0.05] hover:bg-white/[0.09] text-white/70'
            }`}
          >
            <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: t.previewGradient }} />
            <span className="text-[12px] font-medium tracking-tight truncate">{t.name}</span>
          </button>
        );
      })}
    </div>
  );
}

export function useGeneralToggles() {
  const store = useOrchestratorStore;
  const autoStartAgents = store((s) => s.autoStartAgents);
  const setAutoStartAgents = store((s) => s.setAutoStartAgents);
  const autoApprovePermissions = store((s) => s.autoApprovePermissions);
  const setAutoApprovePermissions = store((s) => s.setAutoApprovePermissions);
  const interfaceSounds = store((s) => s.interfaceSounds);
  const setInterfaceSounds = store((s) => s.setInterfaceSounds);
  const showProjectFavicons = store((s) => s.showProjectFavicons);
  const setShowProjectFavicons = store((s) => s.setShowProjectFavicons);
  return {
    autoStart: { on: autoStartAgents, toggle: () => setAutoStartAgents(!autoStartAgents) },
    autoApprove: { on: autoApprovePermissions, toggle: () => setAutoApprovePermissions(!autoApprovePermissions) },
    sounds: { on: interfaceSounds, toggle: () => setInterfaceSounds(!interfaceSounds) },
    favicons: { on: showProjectFavicons, toggle: () => setShowProjectFavicons(!showProjectFavicons) },
  };
}

export function GeneralSettings({ isLight }: { isLight: boolean }) {
  const toggles = useGeneralToggles();
  const [gpu, setGpu] = useState(true);
  const [gpuChanged, setGpuChanged] = useState(false);

  useEffect(() => {
    GetUserPreference('disable_gpu_acceleration')
      .then((val) => setGpu(val !== 'true'))
      .catch(() => undefined);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <ToggleRow title="Auto-start agents" on={toggles.autoStart.on} onChange={toggles.autoStart.toggle} isLight={isLight} />
      <ToggleRow
        title="Auto-approve permissions"
        hint="Skip prompts for folders and commands"
        on={toggles.autoApprove.on}
        onChange={toggles.autoApprove.toggle}
        isLight={isLight}
      />
      <ToggleRow
        title="Interface sounds"
        hint="Chime when an agent finishes"
        on={toggles.sounds.on}
        onChange={toggles.sounds.toggle}
        isLight={isLight}
      />
      <ToggleRow
        title="Project favicons"
        hint="Show each app's icon instead of a folder"
        on={toggles.favicons.on}
        onChange={toggles.favicons.toggle}
        isLight={isLight}
      />
      <ToggleRow
        title="GPU acceleration"
        hint="Turn off if the window crashes or flickers"
        on={gpu}
        onChange={() => {
          const next = !gpu;
          setGpu(next);
          setGpuChanged(true);
          void SetUserPreference('disable_gpu_acceleration', next ? 'false' : 'true');
        }}
        isLight={isLight}
      >
        {gpuChanged && (
          <span className={`text-[11px] ${isLight ? 'text-amber-800' : 'text-amber-200/90'}`}>Restart Orchestrator to apply.</span>
        )}
      </ToggleRow>
    </div>
  );
}

export function WallpaperPicker({ wallpaper, isLight, columns = 3 }: { wallpaper: WallpaperState; isLight: boolean; columns?: number }) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-2">
      <SectionLabel
        isLight={isLight}
        action={
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={`text-[11.5px] font-medium tracking-tight transition-colors cursor-pointer ${
              isLight ? 'text-black/60 hover:text-black' : 'text-white/55 hover:text-white'
            }`}
          >
            Upload
          </button>
        }
      >
        Wallpaper
      </SectionLabel>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void wallpaper.upload(file);
          event.target.value = '';
        }}
      />
      {wallpaper.error && (
        <div className="px-3 py-2 rounded-[10px] bg-amber-500/10 text-[11px] text-amber-100/90">{wallpaper.error}</div>
      )}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {wallpaper.wallpapers.map((item) => {
          const selected = wallpaper.selected?.id === item.id;
          return (
            <div key={item.id} className="relative group">
              <button
                type="button"
                title={item.label}
                onClick={() => wallpaper.select(item.id)}
                className={`w-full aspect-[16/10] rounded-[10px] overflow-hidden transition-all duration-150 cursor-pointer active:scale-95 ${
                  selected
                    ? isLight
                      ? 'ring-2 ring-inset ring-black/80'
                      : 'ring-2 ring-inset ring-white/80'
                    : isLight
                      ? 'ring-1 ring-inset ring-black/15 hover:ring-black/40'
                      : 'ring-1 ring-inset ring-white/15 hover:ring-white/40'
                }`}
              >
                <img src={item.url} alt={item.label} loading="lazy" draggable={false} className="w-full h-full object-cover" />
              </button>
              {isCustom(item.id) && (
                <button
                  type="button"
                  title="Remove"
                  onClick={() => wallpaper.remove(item.id)}
                  className="absolute top-1 right-1 w-[18px] h-[18px] rounded-full bg-black/60 hover:bg-rose-500/80 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-150 cursor-pointer"
                >
                  <span className="material-symbols-rounded text-[12px] text-white leading-none">close</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
