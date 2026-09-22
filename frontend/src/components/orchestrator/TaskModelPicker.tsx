import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useOrchestratorStore } from './useOrchestratorStore';
import { LiquidGlass } from '../../liquid-glass';
import { ScrollArea } from '../common/ScrollArea';
import { useTheme } from '../../themes';

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
  const { currentTheme } = useTheme();
  const isLight = currentTheme.id === 'light' || currentTheme.id === 'white';

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
          isLight
            ? isOpen
              ? 'bg-black/15 border-black/25 text-black shadow-sm'
              : 'bg-black/[0.05] hover:bg-black/[0.09] border-black/10 text-black/80 hover:text-black'
            : isOpen
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
          className={`material-symbols-outlined text-[14px] leading-none transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] shrink-0 ${
            isLight
              ? isOpen
                ? 'rotate-180 text-black'
                : 'rotate-0 text-black/50 group-hover:text-black/85'
              : isOpen
                ? 'rotate-180 text-white'
                : 'rotate-0 text-white/50 group-hover:text-white/85'
          }`}
        >
          expand_more
        </span>
      </button>

      {/* Floating Glass Dropdown Popover */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4, transition: { duration: 0.12, ease: 'easeIn' } }}
            transition={{
              type: 'spring',
              stiffness: 440,
              damping: 30,
              mass: 0.8,
            }}
            style={{ transformOrigin: 'top right' }}
            className="absolute top-[calc(100%+6px)] right-0 z-50 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <LiquidGlass
              variant="panel"
              surface="squircle"
              radius={14}
              bezelWidth={16}
              glassThickness={28}
              refractionScale={0.5}
              blur={0.5}
              specularOpacity={isLight ? 0.2 : 0.06}
              specularSaturation={6}
              lightAngle={-45}
              tint={isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(10, 13, 20, 0.88)'}
              shadow={isLight ? 'subtle' : 'apple'}
              border={
                isLight
                  ? '1px solid rgba(0, 0, 0, 0.10)'
                  : '1px solid rgba(255, 255, 255, 0.09)'
              }
              className={`w-[210px] p-1.5 shadow-2xl ${isLight ? 'text-black' : 'text-white'}`}
              frost={24}
              frostSaturation={130}
              style={{
                boxShadow: isLight
                  ? '0 16px 36px rgba(0, 0, 0, 0.16), 0 4px 12px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8)'
                  : '0 20px 48px rgba(0, 0, 0, 0.75), 0 4px 12px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.09)',
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
                      className={`w-full h-[30px] px-2 rounded-[8px] flex items-center gap-2 text-left transition-colors duration-150 cursor-pointer active:scale-[0.98] ${
                        isSelected
                          ? isLight
                            ? 'bg-black/[0.08] border border-black/[0.08] text-black font-medium'
                            : 'bg-white/[0.12] border border-white/[0.10] text-white font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                          : isLight
                            ? 'border border-transparent text-black/75 hover:text-black hover:bg-black/[0.05]'
                            : 'border border-transparent text-white/75 hover:text-white hover:bg-white/[0.06]'
                      }`}
                    >
                      {mIcon && (
                        <img
                          src={mIcon}
                          alt=""
                          className="w-3.5 h-3.5 object-contain shrink-0 rounded-[2px]"
                          draggable={false}
                        />
                      )}
                      <span className="text-[12px] font-['Geist'] tracking-tight truncate flex-1">
                        {model.name}
                      </span>
                      {isSelected && (
                        <span
                          className={`material-symbols-outlined text-[14px] leading-none shrink-0 ${
                            isLight ? 'text-black/90' : 'text-white/90'
                          }`}
                        >
                          check
                        </span>
                      )}
                    </button>
                  );
                })}
              </ScrollArea>
            </LiquidGlass>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
