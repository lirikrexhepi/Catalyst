import React from 'react';
import { motion } from 'motion/react';
import { useOrchestratorStore } from './useOrchestratorStore';
import { LiquidGlass } from '../../liquid-glass';
import { ThinkingEffort, ThinkingMode } from './types';
import { useTheme } from '../../themes';

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
  const { currentTheme } = useTheme();
  const isLight = currentTheme.id === 'light' || currentTheme.id === 'white';

  const model = propModelId
    ? store.models.find((m) => m.id === propModelId) || store.getConfiguringModel()
    : store.getConfiguringModel();

  if (!model) return null;

  const hasEfforts = Boolean(
    (model.effortLevels && model.effortLevels.length > 0) || model.supportsThinking,
  );
  if (!hasEfforts) return null;

  const provider = store.providers.find((p) => p.id === model.providerId);
  const iconSrc = model.icon || provider?.icon;
  const settings = store.getCurrentModelSettings(model.id);
  const effortLevels = model.effortLevels && model.effortLevels.length > 0
    ? model.effortLevels
    : ['Low', 'Medium', 'High', 'Ultra'];
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
      radius={18}
      bezelWidth={16}
      glassThickness={28}
      refractionScale={0.5}
      blur={0.5}
      specularOpacity={isLight ? 0.3 : 0.06}
      specularSaturation={6}
      lightAngle={-45}
      tint="var(--theme-card-bg, rgba(18, 18, 18, 0.94))"
      shadow={isLight ? 'subtle' : 'apple'}
      border="1px solid var(--theme-card-border, rgba(255, 255, 255, 0.09))"
      className="w-[230px] p-3 text-white shadow-2xl"
      frost={24}
      frostSaturation={isLight ? 110 : 130}
      style={{
        boxShadow: isLight
          ? '0 20px 48px -6px rgba(0, 0, 0, 0.15), 0 6px 18px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)'
          : '0 24px 50px -6px rgba(0, 0, 0, 0.82), 0 8px 24px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.09)',
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
        <span className="text-[13px] font-medium text-white font-['Geist'] tracking-tight truncate">
          {model.name}
        </span>
      </div>

      {/* Effort Level 2x2 Grid with Physical Sliding Glass Indicator */}
      <div className="relative grid grid-cols-2 gap-2 my-2.5">
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
              className={`relative z-10 h-[30px] rounded-[8px] text-[12px] font-['Geist'] flex items-center justify-center cursor-pointer active:scale-95 border transition-all ${
                isSelected
                  ? 'text-white font-medium border-transparent'
                  : 'text-white/70 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.06]'
              }`}
            >
              {isSelected && (
                <motion.div
                  layoutId="effort-level-highlight"
                  className="absolute inset-0 rounded-[8px] bg-white/[0.12] border border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] pointer-events-none"
                  transition={{
                    type: 'spring',
                    stiffness: 440,
                    damping: 30,
                    mass: 0.8,
                  }}
                />
              )}
              <span className="relative z-10">{lvl}</span>
            </button>
          );
        })}
      </div>

      {/* Thinking Mode Segmented Control with Physical Sliding Glass Indicator */}
      {supportsThinking && (
        <>
          <div className="h-[1px] bg-white/[0.08] my-2 mx-0.5" />
          <div className="h-[32px] rounded-[9px] bg-white/[0.04] border border-white/[0.08] p-0.5 relative flex items-center">
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
              {settings.mode === 'normal' && (
                <motion.div
                  layoutId="thinking-mode-highlight"
                  className="absolute inset-0 rounded-[7px] bg-white/[0.12] border border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] pointer-events-none"
                  transition={{
                    type: 'spring',
                    stiffness: 440,
                    damping: 30,
                    mass: 0.8,
                  }}
                />
              )}
              <span className="relative z-10">Normal</span>
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
              {settings.mode === 'thinking' && (
                <motion.div
                  layoutId="thinking-mode-highlight"
                  className="absolute inset-0 rounded-[7px] bg-white/[0.12] border border-white/[0.10] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] pointer-events-none"
                  transition={{
                    type: 'spring',
                    stiffness: 440,
                    damping: 30,
                    mass: 0.8,
                  }}
                />
              )}
              <span className="relative z-10">Thinking</span>
            </button>
          </div>
        </>
      )}
    </LiquidGlass>
  );
};
