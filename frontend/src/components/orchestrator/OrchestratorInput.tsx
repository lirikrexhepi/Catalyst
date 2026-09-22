import React, { useRef, useEffect, useState, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useOrchestratorStore } from './useOrchestratorStore';
import { ModelPicker } from './ModelPicker';
import { EffortPicker } from './EffortPicker';
import { ProjectsState } from './useProjects';
import { LiquidGlass } from '../../liquid-glass';
import { useTheme } from '../../themes';
import { RefractiveGlass } from '../common/RefractiveGlass';
import { useTransitionMount } from '../common/useTransitionMount';
import { SmoothTextarea } from '../common/SmoothTextarea';
import { AttachmentStrip } from '../common/AttachmentStrip';
import { AttachmentsState, filesFromTransfer } from '../common/useAttachments';
import { providerIcon } from './providerIcons';

export interface OrchestratorInputProps {
  onSubmit?: (message: string, modelId: string) => void;
  attachments?: AttachmentsState;
  onInterrupt?: () => void;
  isBusy?: boolean;
  projects?: ProjectsState;
  targetTitle?: string;
  hasActiveAgent?: boolean;
  onNewAgent?: () => void;
  isCreatingNewAgent?: boolean;
  onCancelNewAgent?: () => void;
  viewMode?: 'deck' | 'grid' | 'orchestrator';
  onToggleViewMode?: () => void;
  className?: string;
}

// One rendered line of the message field. The measuring effect, the collapsed
// height and the capsule maths all derive from this, so the line-height in
// textClassName is the only place it may change.
const LINE_HEIGHT = 20;
const MAX_FIELD_HEIGHT = 160;
// The capsule's own vertical padding, matching pt/pb in its className. Named so
// the height maths and the markup cannot drift apart.
const CAPSULE_PADDING_Y = 9;
// The control row the chips sit beneath, matching the h-[38px] triggers.
const CONTROL_ROW_HEIGHT = 38;
// Chips scroll past this rather than growing the capsule, so the column never
// outgrows the message field beside it. Derived so the two stay in step.
const MAX_STRIP_HEIGHT = MAX_FIELD_HEIGHT - CONTROL_ROW_HEIGHT;

export const OrchestratorInput: React.FC<OrchestratorInputProps> = ({
  onSubmit,
  onInterrupt,
  isBusy = false,
  projects,
  attachments,
  targetTitle,
  hasActiveAgent = false,
  onNewAgent,
  isCreatingNewAgent = false,
  onCancelNewAgent,
  viewMode = 'deck',
  onToggleViewMode,
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

  const { currentTheme } = useTheme();
  const isLight = currentTheme.id === 'light' || currentTheme.id === 'white';
  const useOpticalRefraction = currentTheme.id === 'glass' || currentTheme.id === 'refractive-glass' || currentTheme.glass.mode === 'optical-refraction';

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const attachmentsRef = useRef<HTMLDivElement>(null);
  const [textareaHeight, setTextareaHeight] = useState(LINE_HEIGHT);
  const [attachmentHeight, setAttachmentHeight] = useState(0);

  // Transition mount coordination for guaranteed entrance AND exit
  const modelPickerMount = useTransitionMount(isModelPickerOpen, 200);
  const effortPickerMount = useTransitionMount(isEffortPickerOpen, 200);

  const currentModel = getSelectedModel();
  const currentProvider = getSelectedProvider();
  const iconSrc =
    providerIcon(currentModel?.providerId || currentProvider?.id || '', isLight) ||
    currentModel?.icon ||
    currentProvider?.icon;

  // Accurately measure textarea height without causing layout jumps
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    if (!messageText || messageText.length === 0) {
      el.style.height = `${LINE_HEIGHT}px`;
      setTextareaHeight(LINE_HEIGHT);
      return;
    }

    // Set to 0px synchronously to read exact natural scrollHeight
    el.style.height = '0px';
    const scrollH = el.scrollHeight;
    const targetHeight = Math.min(Math.max(scrollH, LINE_HEIGHT), MAX_FIELD_HEIGHT);
    el.style.height = `${targetHeight}px`;
    setTextareaHeight(targetHeight);
  }, [messageText]);

  // The left column's real height, read from the DOM: chips wrap unpredictably,
  // so how many rows they occupy is not something a file count can predict.
  //
  // Measuring the whole column rather than the strip alone is deliberate. The
  // controls and the chips share one column, so adding the strip's height to
  // the collapsed capsule height would count the column's own padding twice —
  // which is what made the capsule one row taller than its contents.
  useLayoutEffect(() => {
    const el = controlsRef.current;
    if (!el) {
      setAttachmentHeight(0);
      return;
    }

    const measure = () => setAttachmentHeight(el.offsetHeight);
    measure();

    // Observed rather than measured once: the column's height depends on how
    // the chips wrap, which changes with the capsule's width and settles after
    // thumbnails load, not only when the file list changes.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [attachments?.items]);

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

  // An attachment on its own is a complete message, so a turn is sendable when
  // there is either text or a staged file.
  const hasAttachments = (attachments?.items.length ?? 0) > 0;
  const canSubmit = messageText.trim().length > 0 || hasAttachments;

  const submitMessage = () => {
    if (!canSubmit) return;
    onSubmit?.(messageText, selectedModelId);
    setMessageText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = `${LINE_HEIGHT}px`;
    }
    setTextareaHeight(LINE_HEIGHT);
  };

  // Pasting a screenshot stages it instead of inserting its text form. Pastes
  // carrying no file fall through untouched so ordinary text still pastes.
  const handlePaste = (e: React.ClipboardEvent) => {
    if (!attachments) return;
    const files = filesFromTransfer(e.clipboardData);
    if (files.length === 0) return;
    e.preventDefault();
    void attachments.accept(files);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!attachments) return;
    const files = filesFromTransfer(e.dataTransfer);
    if (files.length === 0) return;
    e.preventDefault();
    void attachments.accept(files);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitMessage();
    }
    if (e.key === 'Escape') {
      closeAllPickers();
      onCancelNewAgent?.();
      // Esc stops the running turn, as in Claude Code.
      if (isBusy) {
        e.preventDefault();
        onInterrupt?.();
      }
    }
  };

  // Expanded means the field has wrapped past its first line.
  const isExpanded = textareaHeight > LINE_HEIGHT + 4;
  const isScrollable = textareaHeight >= MAX_FIELD_HEIGHT;
  // Base height is strictly 48px; expands downward smoothly up to 192px
  const textHeight = isExpanded ? Math.min(textareaHeight + 28, 192) : 48;
  // Chips stack under the model and project controls, in space that is empty
  // anyway, so the message field keeps its full height. The capsule grows only
  // when that column runs taller than the field beside it.
  const controlsHeight = attachmentHeight > 0 ? attachmentHeight + CAPSULE_PADDING_Y * 2 : 0;
  const capsuleHeight = Math.max(textHeight, controlsHeight, 56);
  const isSpawning = hasActiveAgent && viewMode === 'deck' && isCreatingNewAgent;

  const capsuleContent = (
    <div className="flex w-full h-full gap-1.5 items-start">
          {/* The controls and any staged files share one column, so the chips
              fill space that is empty anyway instead of stealing a row from the
              message field. */}
          <div ref={controlsRef} className="flex flex-col gap-1 shrink-0 min-w-0">
            <div className="flex items-center gap-1.5">
              {/* Left: Model & Provider Selector Trigger (Embedded Pill matching target UI) */}
              <button
                type="button"
                title={currentModel?.name || 'Choose model'}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleModelPicker();
                }}
                className={`h-[38px] flex items-center gap-2 px-3 rounded-[16px] border active:scale-95 transition-all duration-150 cursor-pointer shrink-0 group ${
                  isLight
                    ? 'bg-black/[0.04] hover:bg-black/[0.08] border-black/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]'
                    : 'bg-white/[0.07] hover:bg-white/[0.12] border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                }`}
              >
                {iconSrc && (
                  <img
                    src={iconSrc}
                    alt=""
                    className="w-[18px] h-[18px] object-contain shrink-0 transition-transform duration-200 group-hover:scale-105"
                    draggable={false}
                  />
                )}
                <span className={`text-[13px] font-medium font-['Geist'] tracking-tight select-none leading-none max-w-[130px] truncate ${
                  isLight ? 'text-[#030303]' : 'text-white/95'
                }`}>
                  {currentModel?.name || (isLoadingProviders ? 'Detecting CLIs…' : 'No CLI found')}
                </span>
                <span
                  className={`material-symbols-outlined text-[16px] transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] flex items-center ${
                    isModelPickerOpen
                      ? (isLight ? 'rotate-180 text-[#030303]' : 'rotate-180 text-white')
                      : (isLight ? 'text-black/45 group-hover:text-[#030303]' : 'text-white/45 group-hover:text-white/80')
                  }`}
                >
                  expand_more
                </span>
              </button>

              {/* New Agent Quick Trigger Button - ONLY in Deck mode */}
              {hasActiveAgent && viewMode === 'deck' && (
                <button
                  type="button"
                  title="New agent (Ctrl + N)"
                  aria-label="New agent"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNewAgent?.();
                  }}
                  className={`h-[34px] w-[34px] flex items-center justify-center rounded-full border transition-all duration-150 active:scale-90 cursor-pointer shrink-0 group select-none shadow-sm ${
                    isLight
                      ? 'bg-black/[0.04] hover:bg-black/[0.09] border-black/[0.07] text-[#030303]/70 hover:text-[#030303]'
                      : 'bg-white/[0.06] hover:bg-white/[0.14] border-white/[0.08] text-white/70 hover:text-white'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[17px] leading-none group-hover:rotate-90 transition-transform duration-200 ${
                    isLight ? 'text-[#030303]/80' : 'text-white/80'
                  }`}>
                    add
                  </span>
                </button>
              )}
            </div>

          {/* Staged files, stacked under the controls in the gap beside the
              message field rather than in a row of their own. */}
          {attachments && hasAttachments && (
            <div
              ref={attachmentsRef}
              className="overflow-y-auto overflow-x-hidden custom-scrollbar"
              style={{ maxHeight: `${MAX_STRIP_HEIGHT}px` }}
            >
              <AttachmentStrip
                items={attachments.items}
                onRemove={attachments.remove}
                compact
                className="pl-0.5 pb-0.5 pr-1"
              />
            </div>
          )}
          </div>

          <div className={`h-[22px] w-[1px] mx-2 shrink-0 self-start mt-[8px] ${
            isLight ? 'bg-black/[0.10]' : 'bg-white/[0.10]'
          }`} />

          {/* Center: Multi-line textarea. While collapsed the single line is
              centered against the 38px control row; once it grows it pins to
              the top so expansion runs downward. */}
          <div
            className={`flex-1 min-w-0 pr-1 flex items-center overflow-hidden ${
              isExpanded ? 'items-start pt-[8px]' : 'items-center h-[38px]'
            }`}
          >
            {isSpawning && (
              <div
                className={`flex items-center gap-1 px-2.5 py-0.5 mr-2 rounded-full border text-[11px] font-medium tracking-tight shrink-0 select-none animate-in fade-in duration-150 ${
                  isLight
                    ? 'bg-black/[0.06] border-black/15 text-black'
                    : 'bg-white/[0.10] border-white/20 text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[12px] leading-none">add</span>
                <span>New Agent</span>
                <button
                  type="button"
                  title="Cancel new agent"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancelNewAgent?.();
                  }}
                  className="ml-0.5 opacity-60 hover:opacity-100 cursor-pointer flex items-center"
                >
                  <span className="material-symbols-outlined text-[11px] leading-none">close</span>
                </button>
              </div>
            )}
            <SmoothTextarea
              ref={textareaRef}
              rows={1}
              value={messageText}
              onValueChange={setMessageText}
              onKeyDown={handleKeyDown}
              placeholder={
                isSpawning
                  ? 'Task for new agent…'
                  : viewMode === 'grid' || viewMode === 'orchestrator'
                    ? 'Ask orchestrator…'
                    : !hasActiveAgent
                      ? 'Ask me anything…'
                      : 'Ask a follow up…'
              }
              caretColor={isLight ? '#030303' : 'rgba(255, 255, 255, 0.95)'}
              textClassName={`w-full text-[13.5px] font-normal font-['Geist'] tracking-tight leading-[20px] block ${
                isLight ? 'text-[#030303]' : 'text-white/90'
              }`}
              className={isScrollable ? 'overflow-y-auto' : 'overflow-hidden'}
              placeholderClassName={isLight ? 'text-black/40 truncate' : 'text-white/40 truncate'}
              style={{
                minHeight: `${LINE_HEIGHT}px`,
                maxHeight: `${MAX_FIELD_HEIGHT}px`,
              }}
            />
          </div>

          {/* Right Action Buttons (Attach + Send / Stop) - Kept at bottom along with file attach button */}
          <div className={`flex items-center gap-1 shrink-0 ${isExpanded ? 'self-end' : 'self-center'}`}>
            {/* Attach */}
            {attachments && (
              <button
                type="button"
                title="Attach files"
                aria-label="Attach files"
                disabled={attachments.isBusy}
                onClick={(e) => {
                  e.stopPropagation();
                  void attachments.browse();
                }}
                className={`w-[38px] h-[38px] rounded-full flex items-center justify-center transition-all duration-150 shrink-0 group ${
                  attachments.isBusy
                    ? (isLight ? 'text-black/25 cursor-default' : 'text-white/25 cursor-default')
                    : (isLight
                        ? 'text-black/45 hover:text-[#030303] hover:bg-black/[0.06] active:scale-95 cursor-pointer'
                        : 'text-white/40 hover:text-white hover:bg-white/[0.08] active:scale-95 cursor-pointer')
                }`}
              >
                <span className="material-symbols-rounded text-[20px] leading-none">
                  {attachments.isBusy ? 'hourglass_top' : 'attach_file'}
                </span>
              </button>
            )}

            {/* Stop button while a turn runs */}
            {isBusy && (
              <button
                type="button"
                title="Stop agent"
                onClick={(e) => {
                  e.stopPropagation();
                  onInterrupt?.();
                }}
                className="w-[38px] h-[38px] rounded-full flex items-center justify-center transition-all duration-200 shrink-0 bg-rose-500/25 border border-rose-400/35 hover:bg-rose-500/40 text-rose-300 hover:text-white shadow-[0_2px_12px_rgba(244,63,94,0.3)] active:scale-95 cursor-pointer group"
              >
                <span
                  className="material-symbols-outlined text-[19px] leading-none transition-transform duration-150 group-hover:scale-105"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  stop
                </span>
              </button>
            )}

            {/* Send / Queue button */}
            {(!isBusy || canSubmit) && (
              <button
                type="button"
                title={isBusy ? 'Queue message' : 'Send'}
                disabled={!canSubmit}
                onClick={(e) => {
                  e.stopPropagation();
                  submitMessage();
                }}
                className={`w-[38px] h-[38px] rounded-full flex items-center justify-center transition-all duration-200 shrink-0 group ${
                  canSubmit
                    ? 'bg-[#007AFF] hover:bg-[#0A84FF] text-white shadow-[0_2px_12px_rgba(0,122,255,0.45)] active:scale-95 cursor-pointer'
                    : (isLight
                        ? 'bg-black/[0.04] text-black/30 border border-black/[0.06] cursor-default'
                        : 'bg-white/[0.06] text-white/30 border border-white/[0.05] cursor-default')
                }`}
              >
                <span className="material-symbols-outlined text-[20px] leading-none transition-transform duration-150 group-hover:scale-105">
                  arrow_upward
                </span>
              </button>
            )}
          </div>
        </div>
  );

  return (
    <div
      ref={containerRef}
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={(e) => {
        if (attachments) e.preventDefault();
      }}
      className={`relative flex flex-col items-center select-none ${className}`}
    >
      {/* Main Orchestrator Squircle Bar - Expands strictly downward with stationary top elements */}
      {useOpticalRefraction ? (
        <RefractiveGlass
          borderRadius={26}
          borderWidth={0.07}
          distortionScale={-180}
          redOffset={0}
          greenOffset={10}
          blueOffset={20}
          brightness={50}
          opacity={0.93}
          blur={7}
          displace={0.5}
          backgroundOpacity={0.18}
          saturation={1.8}
          mixBlendMode="screen"
          className="w-[720px] max-w-[calc(100vw-32px)] p-[9px] flex justify-between"
          style={{
            height: `${capsuleHeight}px`,
            transition:
              'height 220ms cubic-bezier(0.16, 1, 0.3, 1), border-radius 220ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 220ms ease',
            boxShadow: isExpanded
              ? '0 28px 60px rgba(0, 0, 0, 0.65), 0 8px 24px rgba(0, 0, 0, 0.4), inset 0 1px 1.5px rgba(255, 255, 255, 0.45), inset 0 0 0 0.5px rgba(255, 255, 255, 0.25)'
              : '0 20px 48px -8px rgba(0, 0, 0, 0.55), 0 6px 18px rgba(0, 0, 0, 0.3), inset 0 1px 1.5px rgba(255, 255, 255, 0.4), inset 0 0 0 0.5px rgba(255, 255, 255, 0.2)',
          }}
        >
          {capsuleContent}
        </RefractiveGlass>
      ) : (
        <LiquidGlass
          variant="panel"
          surface="squircle"
          radius={26}
          bezelWidth={16}
          glassThickness={28}
          refractionScale={0.5}
          blur={0.5}
          frost={24}
          frostSaturation={isLight ? 110 : 130}
          specularOpacity={isLight ? 0.3 : 0.06}
          tint="var(--theme-input-bg, rgba(10, 10, 10, 0.96))"
          shadow={isLight ? 'subtle' : 'apple'}
          border="1px solid var(--theme-input-border, rgba(255, 255, 255, 0.08))"
          className="w-[720px] max-w-[calc(100vw-32px)] p-[9px] flex justify-between"
          style={{
            height: `${capsuleHeight}px`,
            transition:
              'height 220ms cubic-bezier(0.16, 1, 0.3, 1), border-radius 220ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 220ms ease',
            boxShadow: isExpanded
              ? (isLight
                  ? '0 24px 50px rgba(0, 0, 0, 0.12), 0 6px 18px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.9)'
                  : '0 28px 60px rgba(0, 0, 0, 0.8), 0 8px 24px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.12)')
              : (isLight
                  ? '0 16px 36px -6px rgba(0, 0, 0, 0.10), 0 4px 12px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.9)'
                  : '0 20px 48px -8px rgba(0, 0, 0, 0.75), 0 6px 18px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08)'),
          }}
        >
          {capsuleContent}
        </LiquidGlass>
      )}

      {/* Popups Row (Model Picker & Effort Picker) - anchored ABOVE the input bar, flush with model pill */}
      <div
        className="absolute bottom-[calc(100%+12px)] left-[9px] flex items-end gap-2.5 z-50 pointer-events-none"
        onClick={(e) => e.stopPropagation()}
      >
        <AnimatePresence>
          {isModelPickerOpen && (
            <motion.div
              key="orchestrator-model-picker"
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 4, transition: { duration: 0.12, ease: 'easeIn' } }}
              transition={{
                type: 'spring',
                stiffness: 440,
                damping: 30,
                mass: 0.8,
              }}
              style={{ transformOrigin: 'bottom left' }}
              className="origin-bottom-left pointer-events-auto"
            >
              <ModelPicker />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isEffortPickerOpen && (
            <motion.div
              key="orchestrator-effort-picker"
              initial={{ opacity: 0, scale: 0.95, y: 8, x: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 4, x: -4, transition: { duration: 0.12, ease: 'easeIn' } }}
              transition={{
                type: 'spring',
                stiffness: 440,
                damping: 30,
                mass: 0.8,
              }}
              style={{ transformOrigin: 'bottom left' }}
              className="origin-bottom-left pointer-events-auto"
            >
              <EffortPicker />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
