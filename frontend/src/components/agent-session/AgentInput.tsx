import React, { useRef, useState, useLayoutEffect, useEffect } from 'react';
import { useOrchestratorStore } from '../orchestrator/useOrchestratorStore';
import { ModelPicker } from '../orchestrator/ModelPicker';
import { EffortPicker } from '../orchestrator/EffortPicker';
import { useTransitionMount } from '../common/useTransitionMount';
import { SmoothTextarea } from '../common/SmoothTextarea';
import { ThinkingEffort, ThinkingMode } from '../orchestrator/types';

export interface AgentInputProps {
  onSubmit?: (message: string, modelId: string) => void;
  onInterrupt?: () => void;
  isStreaming?: boolean;
  placeholder?: string;
  className?: string;
  defaultModelId?: string;
}

/**
 * AgentInput Component
 * Standalone prompt and model selection container.
 * - Normal Send Button: dark purple/blue squircle with white upward arrow
 * - Running Interrupt Button: circular target icon (radio_button_checked) when agent is streaming
 * - Floating ModelPicker: rich backdrop blur for high contrast over text
 */
export const AgentInput: React.FC<AgentInputProps> = ({
  onSubmit,
  onInterrupt,
  isStreaming = false,
  placeholder = 'Send a message',
  className = '',
  defaultModelId,
}) => {
  const { providers, models } = useOrchestratorStore();

  const [message, setMessage] = useState('');
  const [textareaHeight, setTextareaHeight] = useState(22);
  // Falls back to the store's selection so a window never displays a model the
  // session is not actually running.
  const [localModelId, setLocalModelId] = useState(
    () => defaultModelId || useOrchestratorStore.getState().selectedModelId,
  );
  const [localProviderId, setLocalProviderId] = useState(() => {
    const m = models.find((item) => item.id === defaultModelId);
    return m?.providerId || 'anthropic';
  });

  // Isolated picker states for this AgentInput instance
  const [isLocalModelPickerOpen, setIsLocalModelPickerOpen] = useState(false);
  const [isLocalEffortPickerOpen, setIsLocalEffortPickerOpen] = useState(false);
  const [localSettings, setLocalSettings] = useState<Record<string, { effort: ThinkingEffort; mode: ThinkingMode }>>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const modelPickerMount = useTransitionMount(isLocalModelPickerOpen, 180);
  const effortPickerMount = useTransitionMount(isLocalEffortPickerOpen, 180);

  const currentModel = models.find((m) => m.id === localModelId) || models[0];
  const currentProvider = providers.find((p) => p.id === localProviderId) || providers[0];
  const iconSrc = currentModel?.icon || currentProvider?.icon;

  // Auto-resize textarea height
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    if (!message || message.length === 0) {
      el.style.height = '22px';
      setTextareaHeight(22);
      return;
    }

    el.style.height = '0px';
    const scrollH = el.scrollHeight;
    const targetHeight = Math.min(Math.max(scrollH, 22), 120);
    el.style.height = `${targetHeight}px`;
    setTextareaHeight(targetHeight);
  }, [message]);

  // Handle clicking outside to close pickers
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsLocalModelPickerOpen(false);
        setIsLocalEffortPickerOpen(false);
      }
    };

    if (isLocalModelPickerOpen || isLocalEffortPickerOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isLocalModelPickerOpen, isLocalEffortPickerOpen]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming) {
        onInterrupt?.();
      } else if (message.trim()) {
        onSubmit?.(message, localModelId);
        setMessage('');
        if (textareaRef.current) {
          textareaRef.current.style.height = '22px';
        }
        setTextareaHeight(22);
      }
    }
    if (e.key === 'Escape') {
      setIsLocalModelPickerOpen(false);
      setIsLocalEffortPickerOpen(false);
    }
  };

  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isStreaming) {
      onInterrupt?.();
    } else if (message.trim()) {
      onSubmit?.(message, localModelId);
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = '22px';
      }
      setTextareaHeight(22);
    }
  };

  const handleSelectModel = (modelId: string) => {
    const m = models.find((item) => item.id === modelId);
    if (!m) return;
    if (localModelId === modelId && isLocalEffortPickerOpen) {
      setIsLocalEffortPickerOpen(false);
    } else {
      setLocalModelId(modelId);
      setLocalProviderId(m.providerId);
      setIsLocalEffortPickerOpen(true);
    }
  };

  const handleSelectProvider = (providerId: string) => {
    setLocalProviderId(providerId);
    const providerModels = models.filter((m) => m.providerId === providerId);
    if (providerModels.length > 0) {
      setLocalModelId(providerModels[0].id);
    }
  };

  const isScrollable = textareaHeight >= 120;

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col select-none ${className}`}
    >
      {/* Main Agent Input Box - Frosted White Glass Bubble */}
      <div
        className="rounded-[14px] glass-card border border-white/25 p-2.5 flex flex-col gap-2 transition-all duration-200"
        style={{
          boxShadow:
            '0 4px 16px rgba(0, 0, 0, 0.2), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.35)',
        }}
      >
        {/* Top Textarea Message Input */}
        <div className="w-full px-1 pt-0.5 overflow-hidden">
          <SmoothTextarea
            ref={textareaRef}
            rows={1}
            value={message}
            onValueChange={setMessage}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            caretColor="rgba(255, 255, 255, 0.95)"
            textClassName="w-full text-[11.5px] font-medium font-['Geist'] text-white tracking-tight leading-[20px] block"
            className={isScrollable ? 'overflow-y-auto custom-scrollbar' : 'overflow-hidden'}
            placeholderClassName="text-white/40"
            style={{
              minHeight: '20px',
              maxHeight: '120px',
            }}
          />
        </div>

        {/* Bottom Toolbar: Model Switcher + Action Button */}
        <div className="flex items-center justify-between pt-0.5">
          {/* Model trigger badge */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsLocalModelPickerOpen((prev) => !prev);
              setIsLocalEffortPickerOpen(false);
            }}
            className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-[7px] hover:bg-white/15 active:scale-95 transition-all duration-150 cursor-pointer group"
          >
            {iconSrc && (
              <img
                src={iconSrc}
                alt=""
                className="w-4 h-4 object-contain shrink-0"
                draggable={false}
              />
            )}
            <span className="text-[11.5px] font-medium font-['Geist'] text-white tracking-tight leading-none">
              {currentModel?.name || 'Select Model'}
            </span>
            <span
              className={`material-symbols-outlined text-[15px] text-white/70 group-hover:text-white transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                isLocalModelPickerOpen ? 'rotate-180 text-white' : ''
              }`}
            >
              expand_more
            </span>
          </button>

          {/* Action / Send Button (Normal upward arrow or Interrupt target when streaming) */}
          <button
            type="button"
            onClick={handleButtonClick}
            title={isStreaming ? 'Stop agent' : 'Send message'}
            className="w-[28px] h-[28px] rounded-[9px] bg-[#3a3b50]/80 border border-white/20 hover:bg-[#484964]/90 active:scale-90 flex items-center justify-center transition-all duration-150 cursor-pointer group shrink-0"
          >
            {isStreaming ? (
              <span className="material-symbols-outlined text-[16px] text-blue-300 group-hover:text-rose-300 transition-colors">
                radio_button_checked
              </span>
            ) : (
              <span className="material-symbols-outlined text-[16px] text-white/95 group-hover:text-white transition-colors">
                arrow_upward
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Popups (Independent Model Picker & Effort Picker positioned above input with readable blur) */}
      {(modelPickerMount.shouldRender || effortPickerMount.shouldRender) && (
        <div
          className="absolute bottom-[calc(100%+8px)] left-0 flex items-end gap-2.5 z-50 pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {modelPickerMount.shouldRender && (
            <div
              className="glass-popup-anim origin-bottom-left"
              style={{
                opacity: modelPickerMount.isVisible ? 1 : 0,
                transform: modelPickerMount.isVisible
                  ? 'translate3d(0, 0, 0) scale(1)'
                  : 'translate3d(0, 8px, 0) scale(0.96)',
                pointerEvents: modelPickerMount.isVisible ? 'auto' : 'none',
              }}
            >
              <ModelPicker
                selectedModelId={localModelId}
                selectedProviderId={localProviderId}
                onSelectModel={handleSelectModel}
                onSelectProvider={handleSelectProvider}
                isFloatingPopup={true}
              />
            </div>
          )}

          {effortPickerMount.shouldRender && (
            <div
              className="glass-popup-anim origin-bottom-left"
              style={{
                opacity: effortPickerMount.isVisible ? 1 : 0,
                transform: effortPickerMount.isVisible
                  ? 'translate3d(0, 0, 0) scale(1)'
                  : 'translate3d(-10px, 0, 0) scale(0.96)',
                pointerEvents: effortPickerMount.isVisible ? 'auto' : 'none',
              }}
            >
              <EffortPicker
                configuringModelId={localModelId}
                isFloatingPopup={true}
                onSelectEffort={(effort) => {
                  setLocalSettings((prev) => ({
                    ...prev,
                    [localModelId]: {
                      ...(prev[localModelId] || { mode: 'normal' }),
                      effort,
                    },
                  }));
                }}
                onSelectMode={(mode) => {
                  setLocalSettings((prev) => ({
                    ...prev,
                    [localModelId]: {
                      ...(prev[localModelId] || { effort: 'Medium' }),
                      mode,
                    },
                  }));
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AgentInput;
