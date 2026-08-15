import React, { useRef, useEffect, useState, useLayoutEffect } from 'react';
import { useOrchestratorStore } from './useOrchestratorStore';
import { ModelPicker } from './ModelPicker';
import { EffortPicker } from './EffortPicker';
import { LiquidGlass } from '../../liquid-glass';
import { useTransitionMount } from '../common/useTransitionMount';
import { SmoothTextarea } from '../common/SmoothTextarea';

export interface OrchestratorInputProps {
  onSubmit?: (message: string, modelId: string) => void;
  onInterrupt?: () => void;
  isBusy?: boolean;
  className?: string;
}

export const OrchestratorInput: React.FC<OrchestratorInputProps> = ({
  onSubmit,
  onInterrupt,
  isBusy = false,
  className = '',
}) => {
  const {
    selectedModelId,
    messageText,
    isModelPickerOpen,
    isEffortPickerOpen,
    isLoadingProviders,
    setMessageText,
    toggleModelPicker,
    closeAllPickers,
    getSelectedModel,
    getSelectedProvider,
    loadProviders,
  } = useOrchestratorStore();

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [textareaHeight, setTextareaHeight] = useState(22);

  // Transition mount coordination for guaranteed entrance AND exit
  const modelPickerMount = useTransitionMount(isModelPickerOpen, 200);
  const effortPickerMount = useTransitionMount(isEffortPickerOpen, 200);

  const currentModel = getSelectedModel();
  const currentProvider = getSelectedProvider();
  const iconSrc = currentModel?.icon || currentProvider?.icon;

  // Accurately measure textarea height without causing layout jumps
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    if (!messageText || messageText.length === 0) {
      el.style.height = '22px';
      setTextareaHeight(22);
      return;
    }

    // Set to 0px synchronously to read exact natural scrollHeight
    el.style.height = '0px';
    const scrollH = el.scrollHeight;
    const targetHeight = Math.min(Math.max(scrollH, 22), 160);
    el.style.height = `${targetHeight}px`;
    setTextareaHeight(targetHeight);
  }, [messageText]);

  // Handle clicking outside to close pickers
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeAllPickers();
      }
    };

    if (isModelPickerOpen || isEffortPickerOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isModelPickerOpen, isEffortPickerOpen, closeAllPickers]);

  const submitMessage = () => {
    if (!messageText.trim()) return;
    onSubmit?.(messageText, selectedModelId);
    setMessageText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '22px';
    }
    setTextareaHeight(22);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
    if (e.key === 'Escape') {
      closeAllPickers();
    }
  };

  const isExpanded = textareaHeight > 28;
  const isScrollable = textareaHeight >= 160;
  // Base height is strictly 48px; expands downward smoothly up to 192px
  const capsuleHeight = isExpanded ? Math.min(textareaHeight + 26, 192) : 48;

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col items-center select-none ${className}`}
    >
      {/* Main Orchestrator Capsule Bar - Expands strictly downward with stationary top elements */}
      <LiquidGlass
        variant="capsule"
        surface="squircle"
        radius={isExpanded ? 18 : 15}
        bezelWidth={18}
        glassThickness={24}
        refractionScale={0.8}
        blur={0.4}
        specularOpacity={0.8}
        specularSaturation={6}
        lightAngle={-45}
        tint="rgba(0, 0, 0, 0.20)"
        shadow="apple"
        border="1px solid rgba(255, 255, 255, 0.18)"
        className="w-[580px] px-3 pt-[7px] pb-[7px] flex justify-between"
        style={{
          height: `${capsuleHeight}px`,
          transition:
            'height 220ms cubic-bezier(0.16, 1, 0.3, 1), border-radius 220ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 220ms ease',
          boxShadow: isExpanded
            ? '0 20px 54px rgba(0, 0, 0, 0.55), 0 4px 14px rgba(0, 0, 0, 0.35), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.3)'
            : '0 14px 40px rgba(0, 0, 0, 0.45), 0 3px 10px rgba(0, 0, 0, 0.25), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.25)',
        }}
      >
        <div className="flex w-full h-full gap-1.5 items-start">
          {/* Left: Model & Provider Selector Trigger (Fixed stationary top position) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleModelPicker();
            }}
            className="h-[34px] flex items-center gap-2.5 px-2 rounded-[9px] hover:bg-white/10 active:scale-95 transition-all duration-150 cursor-pointer shrink-0 group self-start"
          >
            {iconSrc && (
              <img
                src={iconSrc}
                alt=""
                className="w-5 h-5 object-contain shrink-0 transition-transform duration-200 group-hover:scale-105"
                draggable={false}
              />
            )}
            <span className="text-[12.5px] font-medium text-white font-['Geist'] tracking-tight select-none leading-none flex items-center whitespace-nowrap">
              {currentModel?.name || (isLoadingProviders ? 'Detecting CLIs…' : 'No CLI found')}
            </span>
            <span
              className={`material-symbols-outlined text-[18px] text-white/70 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] flex items-center ${
                isModelPickerOpen ? 'rotate-180 text-white' : 'group-hover:text-white'
              }`}
            >
              expand_more
            </span>
          </button>

          {/* Vertical Divider (Stationary top alignment) */}
          <div className="h-[20px] w-[1px] bg-white/20 mx-1.5 shrink-0 self-start mt-[7px]" />

          {/* Center: Multi-line textarea. While collapsed the 22px line is
              centered against the 34px control row; once it grows it pins to
              the top so expansion runs downward. */}
          <div
            className={`flex-1 min-w-0 pr-1 flex overflow-hidden ${
              isExpanded ? 'items-start pt-[6px]' : 'items-center h-[34px]'
            }`}
          >
            <SmoothTextarea
              ref={textareaRef}
              rows={1}
              value={messageText}
              onValueChange={setMessageText}
              onKeyDown={handleKeyDown}
              placeholder="Send a message"
              caretColor="rgba(255, 255, 255, 0.95)"
              textClassName="w-full text-[12.5px] font-medium font-['Geist'] text-white/75 tracking-tight leading-[22px] block"
              className={isScrollable ? 'overflow-y-auto' : 'overflow-hidden'}
              placeholderClassName="text-white/75"
              style={{
                minHeight: '22px',
                maxHeight: '160px',
              }}
            />
          </div>

          {/* Right: stop while a turn runs, send otherwise. Disabled only when
              there is nothing to do, so the control never looks dead mid-turn. */}
          <button
            type="button"
            title={isBusy ? 'Stop' : 'Send'}
            disabled={!isBusy && !messageText.trim()}
            onClick={(e) => {
              e.stopPropagation();
              if (isBusy) {
                onInterrupt?.();
                return;
              }
              submitMessage();
            }}
            className={`w-[34px] h-[34px] rounded-[9px] flex items-center justify-center transition-all duration-150 border shrink-0 ml-1.5 self-start group ${
              isBusy
                ? 'bg-white/90 hover:bg-white border-white/40 active:scale-90 cursor-pointer'
                : messageText.trim()
                  ? 'bg-white/15 hover:bg-white/25 border-white/15 active:scale-90 cursor-pointer'
                  : 'bg-white/5 border-white/10 cursor-default'
            }`}
          >
            <span
              className={`material-symbols-outlined text-[20px] transition-colors ${
                isBusy
                  ? 'text-black/80'
                  : messageText.trim()
                    ? 'text-white group-hover:text-white'
                    : 'text-white/30'
              }`}
              style={isBusy ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              {isBusy ? 'stop' : 'arrow_upward'}
            </span>
          </button>
        </div>
      </LiquidGlass>

      {/* Popups Row (Model Picker & Effort Picker with guaranteed entrance AND exit transitions) */}
      {(modelPickerMount.shouldRender || effortPickerMount.shouldRender) && (
        <div
          className="absolute top-[calc(100%+10px)] left-0 flex items-start gap-2.5 z-50 pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {modelPickerMount.shouldRender && (
            <div
              className="glass-popup-anim origin-top-left"
              style={{
                opacity: modelPickerMount.isVisible ? 1 : 0,
                transform: modelPickerMount.isVisible
                  ? 'translate3d(0, 0, 0) scale(1)'
                  : 'translate3d(0, -8px, 0) scale(0.96)',
                pointerEvents: modelPickerMount.isVisible ? 'auto' : 'none',
              }}
            >
              <ModelPicker />
            </div>
          )}

          {effortPickerMount.shouldRender && (
            <div
              className="glass-popup-anim origin-top-left"
              style={{
                opacity: effortPickerMount.isVisible ? 1 : 0,
                transform: effortPickerMount.isVisible
                  ? 'translate3d(0, 0, 0) scale(1)'
                  : 'translate3d(-10px, 0, 0) scale(0.96)',
                pointerEvents: effortPickerMount.isVisible ? 'auto' : 'none',
              }}
            >
              <EffortPicker />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
