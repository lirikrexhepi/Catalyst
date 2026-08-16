import React, { useState } from 'react';
import { useOrchestratorStore } from './useOrchestratorStore';
import { LiquidGlass } from '../../liquid-glass';
import { ScrollArea } from '../common/ScrollArea';
import { AIModel, CLIProvider } from './types';

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
}

const ModelRows: React.FC<ModelRowsProps> = ({
  models,
  providers,
  selectedModelId,
  onSelect,
  scrollable,
}) => {
  const rows = models.map((model) => {
    const isSelected = model.id === selectedModelId;
    const provider = providers.find((p) => p.id === model.providerId);
    const iconSrc = model.icon || provider?.icon;

    return (
      <button
        key={model.id}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSelect(model.id);
        }}
        className={`relative w-full h-[36px] shrink-0 text-left px-3 rounded-[9px] flex items-center gap-3 border transition-colors duration-150 cursor-pointer active:scale-[0.98] ${
          isSelected
            ? 'bg-white/20 border-white/25 text-white font-semibold shadow-sm'
            : 'border-transparent text-white/80 hover:text-white hover:bg-white/10'
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
        <span className="text-[14px] font-medium font-['Geist'] tracking-tight truncate">
          {model.name}
        </span>
      </button>
    );
  });

  return scrollable ? (
    <ScrollArea maxHeight={260} className="flex flex-col gap-1 pr-1">
      {rows}
    </ScrollArea>
  ) : (
    <div className="flex flex-col gap-1">{rows}</div>
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
      tint={isFloatingPopup ? 'rgba(22, 23, 28, 0.62)' : 'rgba(0, 0, 0, 0.20)'}
      shadow="apple"
      border="1px solid rgba(255, 255, 255, 0.18)"
      className="w-[225px] p-2.5 text-white shadow-2xl"
      frost={isFloatingPopup ? 30 : 12}
      frostSaturation={185}
      style={{
        boxShadow:
          '0 20px 48px rgba(0, 0, 0, 0.55), 0 4px 12px rgba(0, 0, 0, 0.35), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.25)',
      }}
    >
      {/* The selected row paints its own highlight. An absolutely positioned bar
          offset by index * a hardcoded pitch drifts, because the real pitch is
          fractional (36px row + a sub-pixel gap): the error compounds down the
          list and visibly misaligns the lower rows. */}
      <ModelRows
        models={currentModels}
        providers={store.providers}
        selectedModelId={selectedModelId}
        onSelect={handleSelectModel}
        scrollable={hasMoreThan5}
      />

      {/* Divider */}
      <div className="h-[1px] bg-white/15 my-2 mx-1" />

      {/* CLI Provider Switcher Bar with Sliding Indicator */}
      <div className="relative h-[34px] rounded-[9px] bg-black/20 border border-white/10 p-0.5 flex items-center gap-1">
        {/* Sliding Indicator for Providers */}
        {selectedProviderIndex >= 0 && (
          <div
            className="absolute top-0.5 bottom-0.5 rounded-[7px] bg-white/20 border border-white/25 shadow-sm transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] pointer-events-none"
            style={{
              left: selectedProviderIndex === 0 ? '2px' : 'calc(50% + 1px)',
              width: 'calc(50% - 3px)',
            }}
          />
        )}

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
              className={`relative z-10 flex-1 h-full rounded-[7px] flex items-center justify-center transition-opacity duration-150 cursor-pointer active:scale-95 ${
                isActive ? 'opacity-100' : 'opacity-60 hover:opacity-90'
              }`}
            >
              <img
                src={provider.icon}
                alt={provider.name}
                className="w-4.5 h-4.5 object-contain"
                draggable={false}
              />
            </button>
          );
        })}
      </div>
    </LiquidGlass>
  );
};
