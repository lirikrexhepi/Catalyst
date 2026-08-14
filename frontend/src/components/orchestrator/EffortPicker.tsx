import React from 'react';
import { useOrchestratorStore } from './useOrchestratorStore';
import { LiquidGlass } from '../../liquid-glass';
import { ThinkingEffort, ThinkingMode } from './types';

export interface EffortPickerProps {
  configuringModelId?: string;
  onSelectEffort?: (effort: ThinkingEffort) => void;
  onSelectMode?: (mode: ThinkingMode) => void;
  isFloatingPopup?: boolean;
}

export const EffortPicker: React.FC<EffortPickerProps> = ({
  configuringModelId: propModelId,
  onSelectEffort: propOnSelectEffort,
  onSelectMode: propOnSelectMode,
  isFloatingPopup = false,
}) => {
  const store = useOrchestratorStore();

  const model = propModelId
    ? store.models.find((m) => m.id === propModelId) || store.getConfiguringModel()
    : store.getConfiguringModel();

  if (!model) return null;

  const provider = store.providers.find((p) => p.id === model.providerId);
  const iconSrc = model.icon || provider?.icon;
  const settings = store.getCurrentModelSettings(model.id);
  const effortLevels = model.effortLevels || ['Low', 'Medium', 'High', 'Ultra'];
  const supportsThinking = model.supportsThinking !== false;

  const handleSelectEffort = (effort: ThinkingEffort) => {
    if (propOnSelectEffort) {
      propOnSelectEffort(effort);
    } else {
      store.setModelSettings(model.id, { effort });
    }
  };

  const handleSelectMode = (mode: ThinkingMode) => {
    if (propOnSelectMode) {
      propOnSelectMode(mode);
    } else {
      store.setModelSettings(model.id, { mode });
    }
  };

  const effortIndex = effortLevels.indexOf(settings.effort);
  const effortRow = effortIndex >= 0 ? Math.floor(effortIndex / 2) : 0;
  const effortCol = effortIndex >= 0 ? effortIndex % 2 : 0;

  return (
    <LiquidGlass
      variant="panel"
      surface="squircle"
      radius={16}
      bezelWidth={18}
      glassThickness={24}
      refractionScale={0.8}
      blur={isFloatingPopup ? 3.0 : 0.4}
      specularOpacity={0.8}
      specularSaturation={6}
      lightAngle={-45}
      tint={isFloatingPopup ? 'rgba(22, 23, 28, 0.92)' : 'rgba(0, 0, 0, 0.20)'}
      shadow="apple"
      border="1px solid rgba(255, 255, 255, 0.18)"
      disableRefraction={isFloatingPopup}
      className="w-[230px] p-3 text-white shadow-2xl"
      frost={isFloatingPopup ? 13 : 6}
      frostSaturation={160}
      style={{
        boxShadow:
          '0 20px 48px rgba(0, 0, 0, 0.55), 0 4px 12px rgba(0, 0, 0, 0.35), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.25)',
      }}
    >
      {/* Header with Model Logo & Name (14px) */}
      <div className="flex items-center gap-2.5 px-0.5 pb-1">
        {iconSrc && (
          <img
            src={iconSrc}
            alt=""
            className="w-[18px] h-[18px] object-contain shrink-0"
            draggable={false}
          />
        )}
        <span className="text-[14px] font-medium text-white font-['Geist'] tracking-tight truncate">
          {model.name}
        </span>
      </div>

      {/* Effort Level 2x2 Grid with Physical Sliding Glass Indicator */}
      <div className="relative grid grid-cols-2 gap-2 my-2.5">
        {/* Sliding Glass Highlight Pill */}
        {effortIndex >= 0 && (
          <div
            className="absolute rounded-[7px] bg-white/20 border border-white/25 shadow-sm transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] pointer-events-none"
            style={{
              top: `${effortRow * 38}px`,
              left: effortCol === 0 ? '0px' : 'calc(50% + 4px)',
              width: 'calc(50% - 4px)',
              height: '30px',
            }}
          />
        )}

        {effortLevels.map((lvl) => {
          const isSelected = settings.effort === lvl;

          return (
            <button
              key={lvl}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSelectEffort(lvl);
              }}
              className={`relative z-10 h-[30px] rounded-[7px] text-[12px] font-['Geist'] flex items-center justify-center transition-colors duration-150 cursor-pointer active:scale-95 border border-white/10 ${
                isSelected
                  ? 'text-white font-semibold'
                  : 'text-white/70 hover:text-white bg-white/5 hover:bg-white/10'
              }`}
            >
              {lvl}
            </button>
          );
        })}
      </div>

      {/* Thinking Mode Segmented Control with Physical Sliding Glass Indicator */}
      {supportsThinking && (
        <>
          <div className="h-[1px] bg-white/15 my-2 mx-0.5" />
          <div className="h-[32px] rounded-[9px] bg-black/30 border border-white/10 p-0.5 relative flex items-center">
            {/* Sliding glass pill indicator */}
            <div
              className="absolute top-0.5 bottom-0.5 rounded-[7px] bg-white/20 border border-white/25 shadow-sm transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] pointer-events-none"
              style={{
                left: settings.mode === 'normal' ? '2px' : 'calc(50% + 1px)',
                width: 'calc(50% - 3px)',
              }}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSelectMode('normal');
              }}
              className={`relative z-10 flex-1 h-full rounded-[7px] text-[12px] font-['Geist'] flex items-center justify-center transition-colors duration-150 cursor-pointer ${
                settings.mode === 'normal'
                  ? 'text-white font-medium'
                  : 'text-white/60 hover:text-white/80 font-normal'
              }`}
            >
              Normal
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSelectMode('thinking');
              }}
              className={`relative z-10 flex-1 h-full rounded-[7px] text-[12px] font-['Geist'] flex items-center justify-center transition-colors duration-150 cursor-pointer ${
                settings.mode === 'thinking'
                  ? 'text-white font-medium'
                  : 'text-white/60 hover:text-white/80 font-normal'
              }`}
            >
              Thinking
            </button>
          </div>
        </>
      )}
    </LiquidGlass>
  );
};
