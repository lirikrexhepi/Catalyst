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
import { readChatDrag } from '../common/chatDrag';
import { providerIcon } from './providerIcons';
import { SkillTestPicker } from './SkillTestPicker';
import { ArrowUp, ChevronDown, Loader2, Paperclip, Plus, Square, X } from 'lucide-react';

export interface OrchestratorInputProps {
  onSubmit?: (message: string, modelId: string) => void;
  onSkillTest?: (message: string, modelId: string, skills: string[]) => void;
  attachments?: AttachmentsState;
  onInterrupt?: () => void;
  isBusy?: boolean;
  projects?: ProjectsState;
  targetTitle?: string;
  hasActiveAgent?: boolean;
  onNewAgent?: () => void;
  isCreatingNewAgent?: boolean;
  onCancelNewAgent?: () => void;
  /** Folder override for the armed new-agent spawn only; null is the active project. */
  newAgentProject?: { id: string; name: string; path: string } | null;
  onNewAgentProjectChange?: (project: { id: string; name: string; path: string } | null) => void;
  viewMode?: 'deck' | 'grid' | 'orchestrator';
  onToggleViewMode?: () => void;
  className?: string;
}

// One rendered line of the message field. The measuring effect, the collapsed
// height and the capsule maths all derive from this, so the line-height in
// textClassName is the only place it may change.
const LINE_HEIGHT = 20;
const MAX_FIELD_HEIGHT = 160;
// The bottom toolbar row, matching h-[40px] in the markup. Named so the
// height maths and the markup cannot drift apart.
const TOOLBAR_HEIGHT = 40;
// Chrome around the rows: the capsule's own padding. Named for the same reason.
const CAPSULE_CHROME = 18;
// Chips get their own row between the field and the toolbar rather than
// growing the capsule without bound.
const MAX_CHIPS_HEIGHT = 84;

export const OrchestratorInput: React.FC<OrchestratorInputProps> = ({
  onSubmit,
  onSkillTest,
  onInterrupt,
  isBusy = false,
  projects,
  attachments,
  targetTitle,
  hasActiveAgent = false,
  onNewAgent,
  isCreatingNewAgent = false,
  onCancelNewAgent,
  newAgentProject = null,
  onNewAgentProjectChange,
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
  const attachmentsRef = useRef<HTMLDivElement>(null);
  const [textareaHeight, setTextareaHeight] = useState(LINE_HEIGHT);
  const [attachmentHeight, setAttachmentHeight] = useState(0);

  // Transition mount coordination for guaranteed entrance AND exit
  const modelPickerMount = useTransitionMount(isModelPickerOpen, 200);
  const effortPickerMount = useTransitionMount(isEffortPickerOpen, 200);
  const [isAgentProjectOpen, setAgentProjectOpen] = useState(false);

  const currentModel = getSelectedModel();
  const accountName = useOrchestratorStore((state) => {
    const provider = state.providers.find((p) => p.id === currentModel?.providerId);
    if (!provider?.accounts || provider.accounts.length < 2) return '';
    const shown = state.shownAccount(provider.id);
    return provider.accounts.find((account) => account.id === shown)?.name ?? '';
  });
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

  // The chips row's real height, read from the DOM: chips wrap
  // unpredictably, so how many rows they occupy is not something a file count
  // can predict. Observed rather than measured once: the height settles after
  // thumbnails load, not only when the file list changes.
  useLayoutEffect(() => {
    const el = attachmentsRef.current;
    if (!el) {
      setAttachmentHeight(0);
      return;
    }

    const measure = () => setAttachmentHeight(el.offsetHeight);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [attachments?.items]);

  // Handle clicking outside to close pickers
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeAllPickers();
        setAgentProjectOpen(false);
      }
    };

    if (isModelPickerOpen || isEffortPickerOpen || isAgentProjectOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isModelPickerOpen, isEffortPickerOpen, isAgentProjectOpen, closeAllPickers]);

  // An attachment on its own is a complete message, so a turn is sendable when
  // there is either text or a staged file.
  const hasAttachments = (attachments?.items.length ?? 0) > 0;
  const canSubmit = messageText.trim().length > 0 || hasAttachments;

  const [testSkills, setTestSkills] = useState<string[]>([]);
  const skillTest = testSkills.length > 0 && Boolean(onSkillTest);

  const submitMessage = () => {
    if (!canSubmit) return;
    if (skillTest) onSkillTest?.(messageText, selectedModelId, testSkills);
    else onSubmit?.(messageText, selectedModelId);
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
    const chat = readChatDrag(e.dataTransfer);
    if (chat) {
      e.preventDefault();
      attachments.addChat(chat);
      return;
    }
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
      setAgentProjectOpen(false);
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
  // The field keeps its full width on its own row; the toolbar lives beneath
  // it, so the capsule stacks text, chips and controls instead of squeezing
  // them side by side.
  const textZoneHeight = isExpanded ? Math.min(textareaHeight + 24, 188) : 40;
  const capsuleHeight = Math.max(textZoneHeight + attachmentHeight + TOOLBAR_HEIGHT + CAPSULE_CHROME, 98);
  const isSpawning = hasActiveAgent && viewMode === 'deck' && isCreatingNewAgent;

  const capsuleContent = (
    <div className="flex flex-col w-full h-full">
      {/* Message field: the full top row. */}
      <div className="flex-1 min-w-0 flex items-start gap-2 px-[14px] pt-[8px] overflow-hidden">
        {isSpawning && (
          <div
            className={`flex items-center gap-1 pl-2.5 pr-1 py-0.5 mt-[1px] rounded-full border text-[11px] font-medium tracking-tight shrink-0 select-none animate-in fade-in duration-150 ${
              isLight
                ? 'bg-black/[0.06] border-black/15 text-black'
                : 'bg-white/[0.10] border-white/20 text-white'
            }`}
          >
            <Plus size={12} strokeWidth={2} />
            <span>New Agent</span>
            <span className={isLight ? 'text-black/30' : 'text-white/30'}>·</span>
            <button
              type="button"
              title="Spawn folder, this agent only"
              onClick={(e) => {
                e.stopPropagation();
                setAgentProjectOpen((open) => !open);
              }}
              className={`flex items-center gap-0.5 max-w-[110px] rounded-full px-1.5 py-px -my-px cursor-pointer transition-colors ${
                isLight ? 'hover:bg-black/[0.08] text-black/70' : 'hover:bg-white/[0.12] text-white/70'
              }`}
            >
              <span className="truncate leading-none py-[3px]">
                {newAgentProject?.name ?? projects?.active?.name ?? '…'}
              </span>
              <ChevronDown size={11} strokeWidth={2} className="shrink-0 opacity-70" />
            </button>
            <button
              type="button"
              title="Cancel new agent"
              onClick={(e) => {
                e.stopPropagation();
                setAgentProjectOpen(false);
                onCancelNewAgent?.();
              }}
              className="ml-0.5 opacity-60 hover:opacity-100 cursor-pointer flex items-center"
            >
              <X size={11} strokeWidth={2} />
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
          className={`flex-1 min-w-0 ${isScrollable ? 'overflow-y-auto' : 'overflow-hidden'}`}
          placeholderClassName={isLight ? 'text-black/40 truncate' : 'text-white/40 truncate'}
          style={{
            minHeight: `${LINE_HEIGHT}px`,
            maxHeight: `${MAX_FIELD_HEIGHT}px`,
          }}
        />
      </div>

      {/* Staged files ride between the field and the toolbar. */}
      {attachments && hasAttachments && (
        <div
          ref={attachmentsRef}
          className="overflow-y-auto overflow-x-hidden custom-scrollbar mx-[14px]"
          style={{ maxHeight: `${MAX_CHIPS_HEIGHT}px` }}
        >
          <AttachmentStrip
            items={attachments.items}
            onRemove={attachments.remove}
            compact
            className="py-1"
          />
        </div>
      )}

      {/* Toolbar: pickers on the left, actions on the right. Borderless, like
          text — the squircle itself is the shape, nothing inside needs a box. */}
      <div className="flex items-center justify-between gap-1.5 px-[8px] pb-[2px] shrink-0" style={{ height: `${TOOLBAR_HEIGHT}px` }}>
        <div className="flex items-center gap-1 min-w-0">
          {/* Model & Provider Selector Trigger */}
          <button
            type="button"
            title={currentModel ? [currentModel.name, accountName].filter(Boolean).join(' · ') : 'Choose model'}
            onClick={(e) => {
              e.stopPropagation();
              toggleModelPicker();
            }}
            className={`h-[32px] flex items-center gap-1.5 px-2 rounded-[10px] active:scale-95 transition-all duration-150 cursor-pointer shrink-0 group ${
              isLight
                ? 'hover:bg-black/[0.05] text-[#030303]'
                : 'hover:bg-white/[0.08] text-white/90'
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
            <span className={`text-[13px] font-medium font-['Geist'] tracking-tight select-none leading-none max-w-[130px] truncate`}>
              {currentModel?.name || (isLoadingProviders ? 'Detecting CLIs…' : 'No CLI found')}
            </span>
            {accountName && (
              <span className={`text-[11px] font-medium font-['Geist'] tracking-tight select-none leading-none max-w-[80px] truncate ${
                isLight ? 'text-black/45' : 'text-white/45'
              }`}>
                {accountName}
              </span>
            )}
            <ChevronDown size={14} strokeWidth={1.75} className={`transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] flex items-center opacity-60 ${ isModelPickerOpen ? 'rotate-180' : '' }`} />
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
              className={`h-[30px] w-[30px] flex items-center justify-center rounded-full transition-all duration-150 active:scale-90 cursor-pointer shrink-0 group select-none ${
                isLight
                  ? 'text-black/45 hover:text-[#030303] hover:bg-black/[0.05]'
                  : 'text-white/45 hover:text-white hover:bg-white/[0.08]'
              }`}
            >
              <Plus size={15} strokeWidth={1.75} className="group-hover:rotate-90 transition-transform duration-200" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {onSkillTest && (
            <SkillTestPicker cwd={projects?.active?.path ?? ''} selected={testSkills} onChange={setTestSkills} isLight={isLight} />
          )}
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
              className={`w-[30px] h-[30px] rounded-full flex items-center justify-center transition-all duration-150 shrink-0 group ${
                attachments.isBusy
                  ? (isLight ? 'text-black/25 cursor-default' : 'text-white/25 cursor-default')
                  : (isLight
                      ? 'text-black/45 hover:text-[#030303] hover:bg-black/[0.05] active:scale-95 cursor-pointer'
                      : 'text-white/45 hover:text-white hover:bg-white/[0.08] active:scale-95 cursor-pointer')
              }`}
            >
              {attachments.isBusy ? <Loader2 size={16} strokeWidth={1.75} className="animate-spin" /> : <Paperclip size={16} strokeWidth={1.75} />}
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
              className="w-[30px] h-[30px] rounded-full flex items-center justify-center transition-all duration-200 shrink-0 bg-rose-500/25 border border-rose-400/35 hover:bg-rose-500/40 text-rose-300 hover:text-white shadow-[0_2px_12px_rgba(244,63,94,0.3)] active:scale-95 cursor-pointer group"
            >
              <Square size={15} strokeWidth={1.75} fill="currentColor" className="transition-transform duration-150 group-hover:scale-105" />
            </button>
          )}

          {/* Send / Queue button */}
          {(!isBusy || canSubmit) && (
            <button
              type="button"
              title={skillTest ? 'Run skill test' : isBusy ? 'Queue message' : 'Send'}
              disabled={!canSubmit}
              onClick={(e) => {
                e.stopPropagation();
                submitMessage();
              }}
              className={`w-[32px] h-[32px] rounded-full flex items-center justify-center transition-all duration-200 shrink-0 group ${
                canSubmit
                  ? 'bg-[#007AFF] hover:bg-[#0A84FF] text-white shadow-[0_2px_12px_rgba(0,122,255,0.45)] active:scale-95 cursor-pointer'
                  : (isLight
                      ? 'text-black/25 cursor-default'
                      : 'text-white/25 cursor-default')
              }`}
            >
              <ArrowUp size={17} strokeWidth={2} className="transition-transform duration-150 group-hover:scale-105" />
            </button>
          )}
        </div>
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
          borderRadius={22}
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
          radius={22}
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

        {/* Spawn folder for the armed new agent only. Picking here never
            switches the top-level project. */}
        <AnimatePresence>
          {isAgentProjectOpen && isSpawning && (
            <motion.div
              key="new-agent-project"
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
              <div
                className={`w-[210px] rounded-[16px] border p-1.5 backdrop-blur-xl ${
                  isLight
                    ? 'bg-white/[0.96] border-black/[0.08] shadow-[0_16px_40px_rgba(0,0,0,0.14)]'
                    : 'bg-[#161617]/[0.96] border-white/[0.10] shadow-[0_16px_40px_rgba(0,0,0,0.6)]'
                }`}
              >
                {(projects?.projects ?? []).length === 0 && (
                  <div className={`px-2.5 py-2 text-[12px] font-['Geist'] ${isLight ? 'text-black/50' : 'text-white/50'}`}>
                    No projects yet
                  </div>
                )}
                {(projects?.projects ?? []).map((project) => {
                  const selected = (newAgentProject?.id ?? projects?.active?.id) === project.id;
                  return (
                    <button
                      key={project.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNewAgentProjectChange?.(
                          project.id === projects?.active?.id
                            ? null
                            : { id: project.id, name: project.name, path: project.path },
                        );
                        setAgentProjectOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-[10px] text-left cursor-pointer transition-colors ${
                        isLight
                          ? 'hover:bg-black/[0.05] text-black/85'
                          : 'hover:bg-white/[0.07] text-white/85'
                      }`}
                    >
                      <span className="material-symbols-rounded text-[15px] leading-none shrink-0 opacity-60">
                        folder
                      </span>
                      <span className="flex-1 min-w-0 text-[12.5px] font-medium font-['Geist'] tracking-tight truncate">
                        {project.name}
                      </span>
                      {selected && (
                        <span className={`material-symbols-rounded text-[15px] leading-none shrink-0 ${isLight ? 'text-black/70' : 'text-white/70'}`}>
                          check
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
