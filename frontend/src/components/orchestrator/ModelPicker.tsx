import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useOrchestratorStore } from './useOrchestratorStore';
import { LiquidGlass } from '../../liquid-glass';
import { ScrollArea } from '../common/ScrollArea';
import { AIModel, CLIProvider } from './types';
import { providerIcon } from './providerIcons';
import { useTheme } from '../../themes';

export interface ModelPickerProps {
  selectedModelId?: string;
  selectedProviderId?: string;
  onSelectModel?: (modelId: string) => void;
  onSelectProvider?: (providerId: string) => void;
  isFloatingPopup?: boolean;
}

interface ModelRowsProps {
  models: AIModel[];
  providers: CLIProvider[];
  selectedModelId: string;
  onSelect: (modelId: string) => void;
  scrollable: boolean;
  isLight?: boolean;
}

const ModelRows: React.FC<ModelRowsProps> = ({
  models,
  providers,
  selectedModelId,
  onSelect,
  scrollable,
  isLight,
}) => {
  const rows = models.map((model) => {
    const isSelected = model.id === selectedModelId;
    const provider = providers.find((p) => p.id === model.providerId);
    const iconSrc = providerIcon(model.providerId, isLight) || model.icon || provider?.icon;

    return (
      <button
        key={model.id}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSelect(model.id);
        }}
        className={`relative w-full h-[36px] shrink-0 text-left px-2.5 rounded-[9px] flex items-center gap-2.5 border transition-all duration-150 cursor-pointer active:scale-[0.98] ${
          isSelected
            ? 'bg-white/[0.12] border-white/[0.10] text-white font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
            : 'border-transparent text-white/75 hover:text-white hover:bg-white/[0.06]'
        }`}
      >
        {iconSrc && (
          <img
            src={iconSrc}
            alt=""
            className="w-[18px] h-[18px] object-contain shrink-0"
            draggable={false}
          />
        )}
        <span className="text-[13px] font-medium font-['Geist'] tracking-tight truncate">
          {model.name}
        </span>
      </button>
    );
  });

  return scrollable ? (
    <ScrollArea maxHeight={260} className="flex flex-col gap-0.5 pr-0.5">
      {rows}
    </ScrollArea>
  ) : (
    <div className="flex flex-col gap-0.5">{rows}</div>
  );
};

export const ModelPicker: React.FC<ModelPickerProps> = ({
  selectedModelId: propModelId,
  selectedProviderId: propProviderId,
  onSelectModel: propOnSelectModel,
  onSelectProvider: propOnSelectProvider,
  isFloatingPopup = false,
}) => {
  const store = useOrchestratorStore();

  const selectedModelId = propModelId !== undefined ? propModelId : store.selectedModelId;
  const [localProviderId, setLocalProviderId] = useState<string | null>(null);

  const selectedProviderId =
    propProviderId !== undefined
      ? (localProviderId || propProviderId)
      : store.selectedProviderId;

  const currentModels = store.getModelsForProvider(selectedProviderId);
  const hasMoreThan5 = currentModels.length > 5;
  const selectedProviderIndex = store.providers.findIndex((p) => p.id === selectedProviderId);

  const handleSelectModel = (modelId: string) => {
    if (propOnSelectModel) {
      propOnSelectModel(modelId);
    } else {
      store.selectModel(modelId);
    }
  };

  const handleSelectProvider = (providerId: string) => {
    if (propOnSelectProvider) {
      setLocalProviderId(providerId);
      propOnSelectProvider(providerId);
    } else {
      store.selectProvider(providerId);
    }
  };

  const { currentTheme } = useTheme();
  const isLight = currentTheme.id === 'light' || currentTheme.id === 'white';

  return (
    <LiquidGlass
      variant="panel"
      surface="squircle"
      radius={18}
      bezelWidth={16}
      glassThickness={28}
      refractionScale={0.5}
      blur={0.5}
      frost={24}
      frostSaturation={isLight ? 110 : 130}
      specularOpacity={isLight ? 0.3 : 0.06}
      tint="var(--theme-card-bg, rgba(18, 18, 18, 0.94))"
      shadow={isLight ? 'subtle' : 'apple'}
      border="1px solid var(--theme-card-border, rgba(255, 255, 255, 0.09))"
      className="w-[230px] p-2 text-white shadow-2xl"
      style={{
        boxShadow: isLight
          ? '0 20px 48px -6px rgba(0, 0, 0, 0.15), 0 6px 18px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9)'
          : '0 24px 50px -6px rgba(0, 0, 0, 0.82), 0 8px 24px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.09)',
      }}
    >
      {/* The selected row paints its own highlight. */}
      <ModelRows
        models={currentModels}
        providers={store.providers}
        selectedModelId={selectedModelId}
        onSelect={handleSelectModel}
        scrollable={hasMoreThan5}
        isLight={isLight}
      />

      {/* Divider */}
      {store.providers.length > 0 && <div className="h-[1px] bg-white/[0.08] my-1.5 mx-1" />}

      {/* CLI Provider Switcher Bar with Fluid Motion Sliding Indicator */}
      {store.providers.length > 0 ? (
        <div className="relative h-[34px] rounded-[10px] bg-white/[0.04] border border-white/[0.07] p-0.5 flex items-center gap-1">
          {store.providers.map((provider) => {
            const isActive = provider.id === selectedProviderId;

            return (
              <button
                key={provider.id}
                type="button"
                title={provider.name}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectProvider(provider.id);
                }}
                className={`relative z-10 flex-1 h-full rounded-[8px] flex items-center justify-center cursor-pointer active:scale-95 transition-all ${
                  isActive ? 'opacity-100' : 'opacity-40 hover:opacity-80'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="model-picker-provider-highlight"
                    className="absolute inset-0 rounded-[8px] bg-white/[0.12] border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] pointer-events-none"
                    transition={{
                      type: 'spring',
                      stiffness: 440,
                      damping: 30,
                      mass: 0.8,
                    }}
                  />
                )}
                {provider.icon ? (
                  <img
                    src={providerIcon(provider.id, isLight) || provider.icon}
                    alt={provider.name}
                    className="w-[18px] h-[18px] object-contain relative z-10 rounded-[3px]"
                    draggable={false}
                  />
                ) : (
                  <span className="material-symbols-rounded text-[18px] text-white/60 relative z-10 leading-none">
                    smart_toy
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="py-2 text-center text-[11px] text-white/40 font-['Geist']">
          No providers enabled
        </div>
      )}
    </LiquidGlass>
  );
};
