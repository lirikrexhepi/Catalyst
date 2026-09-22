import React, { useRef, useState, useEffect } from 'react';
import { ScrollArea } from '../common/ScrollArea';
import { CleanDropdown } from '../common/CleanDropdown';
import { WallpaperState } from './useWallpaper';
import { DefaultModels } from './useDefaultModels';
import { isCustom } from './wallpapers';
import { useTheme } from '../../themes';
import { providerIcon } from '../orchestrator/providerIcons';
import { useOrchestratorStore } from '../orchestrator/useOrchestratorStore';
import { RemoteAccessSection } from './RemoteAccessSection';
import { GetUserPreference, SetUserPreference } from '../../../wailsjs/go/main/App';

export interface SettingsPanelProps {
  wallpaper: WallpaperState;
  defaultModels: DefaultModels;
  onClose: () => void;
  className?: string;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  wallpaper,
  defaultModels,
  onClose,
  className = '',
}) => {
  const { currentTheme, themeId, availableThemes, setTheme } = useTheme();
  const isLight = currentTheme.id === 'light' || currentTheme.id === 'white';
  const fileRef = useRef<HTMLInputElement>(null);
  const autoStartAgents = useOrchestratorStore((s) => s.autoStartAgents);
  const setAutoStartAgents = useOrchestratorStore((s) => s.setAutoStartAgents);
  const autoApprovePermissions = useOrchestratorStore((s) => s.autoApprovePermissions);
  const setAutoApprovePermissions = useOrchestratorStore((s) => s.setAutoApprovePermissions);
  const interfaceSounds = useOrchestratorStore((s) => s.interfaceSounds);
  const setInterfaceSounds = useOrchestratorStore((s) => s.setInterfaceSounds);

  const [gpuAcceleration, setGpuAcceleration] = useState<boolean>(true);
  const [hasChangedGpu, setHasChangedGpu] = useState<boolean>(false);

  useEffect(() => {
    GetUserPreference('disable_gpu_acceleration')
      .then((val) => {
        if (val === 'true') {
          setGpuAcceleration(false);
        } else {
          setGpuAcceleration(true);
        }
      })
      .catch((err) => {
        console.warn('Failed to read GPU acceleration preference:', err);
      });
  }, []);

  const handleToggleGpu = () => {
    const nextVal = !gpuAcceleration;
    setGpuAcceleration(nextVal);
    setHasChangedGpu(true);
    void SetUserPreference('disable_gpu_acceleration', nextVal ? 'false' : 'true');
  };

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void wallpaper.upload(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className={`w-full h-full flex flex-col select-none ${className}`}>
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
          className="w-[24px] h-[24px] rounded-full hover:bg-white/10 active:scale-90 flex items-center justify-center transition-all duration-150 cursor-pointer text-white/45 hover:text-white"
        >
          <span className="material-symbols-rounded text-[16px] leading-none">close</span>
        </button>
      </div>

      <ScrollArea maxHeight={460} className="px-4 pb-4 flex flex-col gap-2.5">
        {/* Themes: Dark, Light, Glass */}
        <div className="flex items-baseline justify-between gap-2 px-0.5 pt-0.5">
          <span className="text-[10px] font-semibold font-['Geist'] text-white/45 tracking-tight uppercase">
            Theme
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {availableThemes.map((t) => {
            const isSelected = t.id === themeId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme(t.id)}
                className={`py-2 px-2.5 rounded-[10px] flex items-center justify-between transition-all duration-150 cursor-pointer active:scale-95 ${
                  isSelected
                    ? isLight
                      ? 'bg-black/10 text-black shadow-sm border border-black/10'
                      : 'bg-white/20 text-white shadow-sm'
                    : isLight
                      ? 'bg-black/[0.04] hover:bg-black/[0.07] text-black/70'
                      : 'bg-white/[0.05] hover:bg-white/[0.09] text-white/70'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-3.5 h-3.5 rounded-full shrink-0 shadow-inner"
                    style={{ background: t.previewGradient }}
                  />
                  <span className={`text-[12px] font-medium font-['Geist'] tracking-tight truncate ${
                    isLight ? 'text-[#030303]' : 'text-white/95'
                  }`}>
                    {t.name}
                  </span>
                </div>
                {isSelected && (
                  <span className={`material-symbols-rounded text-[13px] leading-none shrink-0 ml-1 ${
                    isLight ? 'text-black' : 'text-white'
                  }`}>
                    check
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Auto-start agents Toggle */}
        <div className={`flex items-center justify-between p-2.5 rounded-[10px] ${
          isLight ? 'bg-black/[0.04]' : 'bg-white/[0.04]'
        }`}>
          <span className={`text-[12px] font-medium font-['Geist'] tracking-tight ${
            isLight ? 'text-[#030303]' : 'text-white/90'
          }`}>
            Auto-start agents
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={autoStartAgents}
            onClick={() => setAutoStartAgents(!autoStartAgents)}
            className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 ease-out cursor-pointer ${
              autoStartAgents
                ? isLight ? 'bg-[#007AFF]' : 'bg-white/90'
                : isLight ? 'bg-black/15' : 'bg-white/15'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full transition-transform duration-200 ease-out ${
                autoStartAgents
                  ? isLight ? 'translate-x-4 bg-white shadow-sm' : 'translate-x-4 bg-black shadow-sm'
                  : isLight ? 'translate-x-0 bg-white shadow-sm' : 'translate-x-0 bg-white/60'
              }`}
            />
          </button>
        </div>

        {/* Auto-approve permissions Toggle */}
        <div className={`flex items-center justify-between p-2.5 rounded-[10px] ${
          isLight ? 'bg-black/[0.04]' : 'bg-white/[0.04]'
        }`}>
          <div className="flex flex-col">
            <span className={`text-[12px] font-medium font-['Geist'] tracking-tight ${
              isLight ? 'text-[#030303]' : 'text-white/90'
            }`}>
              Auto-approve permissions
            </span>
            <span className={`text-[10px] font-['Geist'] tracking-tight leading-snug ${
              isLight ? 'text-black/50' : 'text-white/40'
            }`}>
              Bypass prompts for folders & commands
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoApprovePermissions}
            onClick={() => setAutoApprovePermissions(!autoApprovePermissions)}
            className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 ease-out cursor-pointer shrink-0 ml-2 ${
              autoApprovePermissions
                ? isLight ? 'bg-[#007AFF]' : 'bg-white/90'
                : isLight ? 'bg-black/15' : 'bg-white/15'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full transition-transform duration-200 ease-out ${
                autoApprovePermissions
                  ? isLight ? 'translate-x-4 bg-white shadow-sm' : 'translate-x-4 bg-black shadow-sm'
                  : isLight ? 'translate-x-0 bg-white shadow-sm' : 'translate-x-0 bg-white/60'
              }`}
            />
          </button>
        </div>

        <div className={`flex items-center justify-between p-2.5 rounded-[10px] ${
          isLight ? 'bg-black/[0.04]' : 'bg-white/[0.04]'
        }`}>
          <div className="flex flex-col">
            <span className={`text-[12px] font-medium font-['Geist'] tracking-tight ${
              isLight ? 'text-[#030303]' : 'text-white/90'
            }`}>
              Interface sounds
            </span>
            <span className={`text-[10px] font-['Geist'] tracking-tight leading-snug ${
              isLight ? 'text-black/50' : 'text-white/40'
            }`}>
              Chime when an agent finishes a task
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={interfaceSounds}
            data-cuelume-toggle
            onClick={() => setInterfaceSounds(!interfaceSounds)}
            className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 ease-out cursor-pointer shrink-0 ml-2 ${
              interfaceSounds
                ? isLight ? 'bg-[#007AFF]' : 'bg-white/90'
                : isLight ? 'bg-black/15' : 'bg-white/15'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full transition-transform duration-200 ease-out ${
                interfaceSounds
                  ? isLight ? 'translate-x-4 bg-white shadow-sm' : 'translate-x-4 bg-black shadow-sm'
                  : isLight ? 'translate-x-0 bg-white shadow-sm' : 'translate-x-0 bg-white/60'
              }`}
            />
          </button>
        </div>

        {/* GPU Hardware Acceleration Toggle */}
        <div className={`flex flex-col gap-1.5 p-2.5 rounded-[10px] ${
          isLight ? 'bg-black/[0.04]' : 'bg-white/[0.04]'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className={`text-[12px] font-medium font-['Geist'] tracking-tight ${
                isLight ? 'text-[#030303]' : 'text-white/90'
              }`}>
                GPU Hardware Acceleration
              </span>
              <span className={`text-[10px] font-['Geist'] tracking-tight leading-snug ${
                isLight ? 'text-black/50' : 'text-white/40'
              }`}>
                Accelerates window rendering. Turn off if experiencing GPU crashes.
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={gpuAcceleration}
              onClick={handleToggleGpu}
              className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 ease-out cursor-pointer shrink-0 ml-2 ${
                gpuAcceleration
                  ? isLight ? 'bg-[#007AFF]' : 'bg-white/90'
                  : isLight ? 'bg-black/15' : 'bg-white/15'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full transition-transform duration-200 ease-out ${
                  gpuAcceleration
                    ? isLight ? 'translate-x-4 bg-white shadow-sm' : 'translate-x-4 bg-black shadow-sm'
                    : isLight ? 'translate-x-0 bg-white shadow-sm' : 'translate-x-0 bg-white/60'
                }`}
              />
            </button>
          </div>
          {hasChangedGpu && (
            <div className={`text-[10px] font-medium font-['Geist'] px-2 py-1 rounded-[6px] ${
              isLight ? 'bg-amber-500/15 text-amber-900 border border-amber-500/20' : 'bg-amber-500/20 text-amber-200 border border-amber-500/30'
            }`}>
              Restart Orchestrator for change to take effect.
            </div>
          )}
        </div>

        {/* Remote Phone Access from University / Cell */}
        <RemoteAccessSection />

        {defaultModels.entries.length > 0 && (
          <>
            <div className="flex items-baseline justify-between gap-2 px-0.5 pt-1.5">
              <span className="text-[10px] font-semibold font-['Geist'] text-white/45 tracking-tight uppercase">
                Providers & Models
              </span>
              <span className="text-[10px] font-['Geist'] text-white/25 tracking-tight">
                toggle to enable
              </span>
            </div>

            {defaultModels.error && (
              <div className="px-3 py-2 rounded-[9px] bg-amber-500/10 border border-amber-400/25">
                <span className="text-[11px] font-medium font-['Geist'] text-amber-100/90 leading-relaxed">
                  {defaultModels.error}
                </span>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              {defaultModels.entries.map(({ provider, models, modelId, enabled }) => {
                const options = [
                  { value: '', label: 'CLI default' },
                  ...models.map((m) => ({ value: m.id, label: m.name })),
                ];

                return (
                  <div
                    key={provider.id}
                    className={`grid grid-cols-[1fr_auto_145px] items-center gap-2.5 p-2 rounded-[10px] transition-colors ${
                      enabled
                        ? isLight ? 'bg-black/[0.04]' : 'bg-white/[0.05]'
                        : isLight ? 'bg-black/[0.02] opacity-60' : 'bg-white/[0.02] opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {provider.icon ? (
                        <img
                          src={providerIcon(provider.id, isLight) || provider.icon}
                          alt=""
                          draggable={false}
                          className="w-[18px] h-[18px] object-contain shrink-0 rounded-[3px]"
                        />
                      ) : (
                        <span className={`material-symbols-rounded text-[18px] leading-none shrink-0 ${
                          isLight ? 'text-black/50' : 'text-white/50'
                        }`}>
                          smart_toy
                        </span>
                      )}

                      <span className={`text-[12px] font-medium font-['Geist'] tracking-tight truncate ${
                        isLight ? 'text-[#030303]' : 'text-white/90'
                      }`}>
                        {provider.name}
                      </span>
                    </div>

                    {/* Enable/Disable Permission Toggle */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      title={enabled ? `Disable ${provider.name}` : `Enable ${provider.name}`}
                      onClick={() => void defaultModels.toggle(provider.id, !enabled)}
                      className={`w-8 h-[18px] rounded-full p-0.5 transition-colors duration-200 ease-out cursor-pointer shrink-0 ${
                        enabled
                          ? isLight ? 'bg-[#007AFF]' : 'bg-white/90'
                          : isLight ? 'bg-black/15' : 'bg-white/15'
                      }`}
                    >
                      <div
                        className={`w-3.5 h-3.5 rounded-full transition-transform duration-200 ease-out ${
                          enabled
                            ? isLight ? 'translate-x-3.5 bg-white shadow-sm' : 'translate-x-3.5 bg-black shadow-sm'
                            : isLight ? 'translate-x-0 bg-white shadow-sm' : 'translate-x-0 bg-white/60'
                        }`}
                      />
                    </button>

                    {/* Simplistic Clean Dropdown for Preferred Model */}
                    <CleanDropdown
                      value={modelId}
                      options={options}
                      disabled={!enabled || defaultModels.isSaving === provider.id || models.length === 0}
                      onChange={(val) => void defaultModels.select(provider.id, val)}
                      className="w-[145px]"
                    />
                  </div>
                );
              })}
            </div>

            <div className={`h-px my-1 ${isLight ? 'bg-black/[0.06]' : 'bg-white/[0.06]'}`} />
          </>
        )}

        <div className="flex items-baseline justify-between gap-2 px-0.5">
          <span className={`text-[10px] font-semibold font-['Geist'] tracking-tight uppercase ${
            isLight ? 'text-black/45' : 'text-white/45'
          }`}>
            Wallpaper
          </span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={`text-[11px] font-medium font-['Geist'] tracking-tight transition-colors cursor-pointer ${
              isLight ? 'text-black/60 hover:text-black' : 'text-white/60 hover:text-white'
            }`}
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
                      ? isLight ? 'ring-2 ring-inset ring-black/80' : 'ring-2 ring-inset ring-white/80'
                      : isLight ? 'ring-1 ring-inset ring-black/15 hover:ring-black/40' : 'ring-1 ring-inset ring-white/15 hover:ring-white/40'
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
    </div>
  );
};

export default SettingsPanel;
