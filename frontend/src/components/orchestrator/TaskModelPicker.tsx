import React, { useRef, useEffect } from 'react';
import { useOrchestratorStore } from './useOrchestratorStore';
import { LiquidGlass } from '../../liquid-glass';
import { ScrollArea } from '../common/ScrollArea';

export interface TaskModelPickerProps {
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export const TaskModelPicker: React.FC<TaskModelPickerProps> = ({
  selectedModelId,
  onSelectModel,
  isOpen,
  onToggle,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const models = useOrchestratorStore((state) => state.models);
  const providers = useOrchestratorStore((state) => state.providers);

  const currentModel = models.find((m) => m.id === selectedModelId);
  const currentProvider = providers.find((p) => p.id === currentModel?.providerId);
  const iconSrc = currentModel?.icon || currentProvider?.icon;

  // Handle outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen, onClose]);

  return (
    <div ref={containerRef} className="relative shrink-0 select-none">
      {/* Frosted Glass Pill Trigger */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`h-[24px] max-w-[190px] px-2 rounded-[7px] flex items-center gap-1.5 border transition-all duration-150 cursor-pointer active:scale-95 group ${
          isOpen
            ? 'bg-white/20 border-white/30 text-white shadow-md'
            : 'bg-white/8 hover:bg-white/14 border-white/15 text-white/85 hover:text-white shadow-sm'
        }`}
      >
        {iconSrc && (
          <img
            src={iconSrc}
            alt=""
            className="w-3.5 h-3.5 object-contain shrink-0"
            draggable={false}
          />
        )}
        <span className="text-[11px] font-medium font-['Geist'] tracking-tight truncate">
          {currentModel?.name || 'Select model'}
        </span>
        <span
          className={`material-symbols-outlined text-[14px] text-white/50 group-hover:text-white/85 leading-none transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] shrink-0 ${
            isOpen ? 'rotate-180 text-white' : 'rotate-0'
          }`}
        >
          expand_more
        </span>
      </button>

      {/* Floating Glass Dropdown Popover */}
      {isOpen && (
        <div
          className="absolute top-[calc(100%+6px)] right-0 z-50 glass-popup-anim origin-top-right pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <LiquidGlass
            variant="panel"
            surface="squircle"
            radius={12}
            bezelWidth={14}
            glassThickness={20}
            refractionScale={0.8}
            blur={2.5}
            specularOpacity={0.7}
            specularSaturation={6}
            lightAngle={-45}
            tint="rgba(20, 22, 28, 0.94)"
            shadow="apple"
            border="1px solid rgba(255, 255, 255, 0.20)"
            className="w-[210px] p-1.5 text-white shadow-2xl"
            frost={24}
            frostSaturation={180}
            style={{
              boxShadow:
                '0 16px 40px rgba(0, 0, 0, 0.6), 0 4px 12px rgba(0, 0, 0, 0.35), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.25)',
            }}
          >
            <ScrollArea maxHeight={200} className="flex flex-col gap-0.5 pr-0.5">
              {models.map((model) => {
                const isSelected = model.id === selectedModelId;
                const provider = providers.find((p) => p.id === model.providerId);
                const mIcon = model.icon || provider?.icon;

                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      onSelectModel(model.id);
                      onClose();
                    }}
                    className={`w-full h-[30px] px-2 rounded-[6px] flex items-center gap-2 text-left transition-colors duration-150 cursor-pointer active:scale-[0.98] ${
                      isSelected
                        ? 'bg-white/20 text-white font-medium shadow-xs'
                        : 'text-white/75 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {mIcon && (
                      <img
                        src={mIcon}
                        alt=""
                        className="w-3.5 h-3.5 object-contain shrink-0"
                        draggable={false}
                      />
                    )}
                    <span className="text-[12px] font-['Geist'] tracking-tight truncate flex-1">
                      {model.name}
                    </span>
                    {isSelected && (
                      <span className="material-symbols-outlined text-[14px] text-white/90 leading-none shrink-0">
                        check
                      </span>
                    )}
                  </button>
                );
              })}
            </ScrollArea>
          </LiquidGlass>
        </div>
      )}
    </div>
  );
};
