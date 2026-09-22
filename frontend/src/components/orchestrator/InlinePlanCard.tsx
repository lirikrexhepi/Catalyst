import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../../themes';
import { useOrchestratorStore } from './useOrchestratorStore';
import { TaskModelPicker } from './TaskModelPicker';

export interface InlineTaskItem {
  action?: 'spawn' | 'message';
  targetThreadId?: string;
  title: string;
  prompt: string;
  cwd?: string;
}

export interface InlinePlanCardProps {
  tasks: InlineTaskItem[];
  canUseWorktree?: boolean;
  onConfirm: (useWorktree: boolean, modelIds: string[]) => void;
  onDismiss?: () => void;
  isDispatched?: boolean;
  isLatest?: boolean;
  isActive?: boolean;
  isStreaming?: boolean;
  className?: string;
}

const MUTATING_HINT =
  /\b(refactor|implement|fix|bug|migrat|rewrite|rename|delete|remove|add|build|creat|updat|chang|edit|modif|patch|install|upgrade|revert|merge|commit|scaffold|generat|convert|optimi[sz]|clean\s?up|deprecat)/i;

function looksMutating(tasks: InlineTaskItem[]): boolean {
  return tasks.some((task) => MUTATING_HINT.test(`${task.title} ${task.prompt}`));
}

export const InlinePlanCard: React.FC<InlinePlanCardProps> = ({
  tasks,
  canUseWorktree = false,
  onConfirm,
  onDismiss,
  isDispatched: propDispatched = false,
  isLatest = false,
  isActive = true,
  isStreaming = false,
  className = '',
}) => {
  const { currentTheme } = useTheme();
  const isLight = currentTheme.id === 'light' || currentTheme.id === 'white';

  const isMutating = looksMutating(tasks);
  const [useWorktree, setUseWorktree] = useState(canUseWorktree && isMutating);
  const [openPickerIndex, setOpenPickerIndex] = useState<number | null>(null);
  const [localDispatched, setLocalDispatched] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const isDispatched = propDispatched || localDispatched;

  const selectedModelId = useOrchestratorStore((state) => state.selectedModelId);
  const [modelIds, setModelIds] = useState<string[]>(() =>
    tasks.map(() => selectedModelId),
  );

  const setModelFor = (index: number, modelId: string) =>
    setModelIds((previous) => previous.map((id, at) => (at === index ? modelId : id)));

  const handleConfirm = useCallback(() => {
    if (isDispatched || isStreaming) return;
    setLocalDispatched(true);
    onConfirm(useWorktree, modelIds);
  }, [isDispatched, isStreaming, onConfirm, useWorktree, modelIds]);

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  // Keyboard shortcut: A simple Enter triggers Start agent when plan is active and latest
  useEffect(() => {
    if (!isActive || !isLatest || isDispatched || isDismissed || isStreaming) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      if (openPickerIndex !== null) return;

      // If user is currently typing non-empty text in an input or textarea, let Enter submit that text instead
      const activeEl = document.activeElement;
      if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) {
        if (activeEl.value.trim().length > 0) {
          return;
        }
      }

      // Also verify the omnibar messageText has no text
      if (useOrchestratorStore.getState().messageText.trim().length > 0) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      handleConfirm();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isActive, isLatest, isDispatched, isDismissed, isStreaming, openPickerIndex, handleConfirm]);

  if (isDismissed) {
    return (
      <div
        className={`my-2 py-2 px-3 rounded-[10px] border text-[11px] font-['Geist'] text-current/40 flex items-center justify-between transition-colors ${
          isLight ? 'bg-black/[0.02] border-black/[0.05]' : 'bg-white/[0.02] border-white/[0.05]'
        } ${className}`}
      >
        <span className="italic">Plan dismissed</span>
        <button
          type="button"
          onClick={() => setIsDismissed(false)}
          className="not-italic text-current/60 hover:text-current underline cursor-pointer"
        >
          Restore
        </button>
      </div>
    );
  }

  return (
    <div
      className={`w-full rounded-[14px] p-3 my-2 select-none border transition-all duration-200 ${
        isLight
          ? 'bg-black/[0.025] border-black/[0.07] shadow-sm'
          : 'bg-white/[0.035] border-white/[0.08] shadow-sm backdrop-blur-sm'
      } ${className}`}
    >
      {/* Task(s) */}
      <div className="flex flex-col">
        {tasks.map((task, index) => (
          <div
            key={`${task.title}-${index}`}
            className={`flex flex-col gap-1 ${
              index > 0 ? 'pt-2.5 mt-2.5 border-t border-current/[0.06]' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 min-w-0">
                {tasks.length > 1 && (
                  <span className="text-[11px] font-medium text-current/40 tabular-nums">
                    {index + 1}.
                  </span>
                )}
                <span className="text-[12.5px] font-medium font-['Geist'] text-current tracking-tight truncate">
                  {task.title}
                </span>
                {task.action === 'message' && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-400/25 shrink-0">
                    Route to {task.targetThreadId || 'agent'}
                  </span>
                )}
              </div>

              {/* Model picker per task (only for newly spawned tasks) */}
              {!isDispatched && task.action !== 'message' && (
                <TaskModelPicker
                  selectedModelId={modelIds[index] || selectedModelId}
                  onSelectModel={(newModelId) => setModelFor(index, newModelId)}
                  isOpen={openPickerIndex === index}
                  onToggle={() =>
                    setOpenPickerIndex((current) => (current === index ? null : index))
                  }
                  onClose={() => setOpenPickerIndex(null)}
                />
              )}
            </div>

            {task.prompt && (
              <div className="text-[11.5px] font-['Geist'] text-current/60 leading-relaxed select-text pr-2">
                {task.prompt}
              </div>
            )}

            {task.cwd && (
              <div className="text-[10px] font-mono text-current/40 truncate pt-0.5">
                📁 {task.cwd}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer Controls: Actions + Worktree */}
      <div className="flex items-center justify-between gap-3 pt-2.5 mt-2.5 border-t border-current/[0.06]">
        {!isDispatched ? (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={isStreaming}
              onClick={handleConfirm}
              className={`h-[26px] px-2.5 rounded-[7px] text-[11.5px] font-medium font-['Geist'] tracking-tight transition-all duration-150 cursor-pointer shadow-sm active:scale-95 flex items-center gap-1.5 ${
                isLight
                  ? 'bg-[#030303] text-white hover:bg-black/90'
                  : 'bg-white text-black hover:bg-white/90'
              } ${isStreaming ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span>
                {tasks.every((t) => t.action === 'message')
                  ? tasks.length > 1
                    ? 'Send to agents'
                    : 'Send to agent'
                  : tasks.length > 1
                  ? 'Start agents'
                  : 'Start agent'}
              </span>
              <kbd
                className={`text-[10px] font-mono leading-none px-1 py-0.5 rounded ${
                  isLight
                    ? 'bg-white/20 text-white/90'
                    : 'bg-black/15 text-black/70'
                }`}
              >
                ↵
              </kbd>
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="text-[11.5px] font-['Geist'] text-current/40 hover:text-current/80 transition-colors cursor-pointer px-1 py-0.5 active:scale-95"
            >
              Dismiss
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] font-medium font-['Geist'] text-emerald-400">
            <span className="material-symbols-outlined text-[13px] leading-none">
              check_circle
            </span>
            <span>Agent{tasks.length > 1 ? 's' : ''} running</span>
          </div>
        )}

        {/* Worktree isolation toggle (minimalist right-aligned) */}
        {canUseWorktree && !isDispatched && (
          <button
            type="button"
            onClick={() => setUseWorktree((prev) => !prev)}
            className="flex items-center gap-1.5 group cursor-pointer select-none py-0.5 opacity-60 hover:opacity-100 transition-opacity"
          >
            <span
              className={`w-[13px] h-[13px] rounded-[3px] border flex items-center justify-center transition-colors ${
                useWorktree
                  ? isLight
                    ? 'bg-black border-black text-white'
                    : 'bg-white border-white text-black'
                  : 'bg-transparent border-current/30 group-hover:border-current/50'
              }`}
            >
              {useWorktree && (
                <span className="material-symbols-outlined text-[10px] leading-none">
                  check
                </span>
              )}
            </span>
            <span className="text-[10.5px] font-['Geist'] text-current/60 group-hover:text-current/90 tracking-tight">
              Worktree isolation
            </span>
          </button>
        )}
      </div>
    </div>
  );
};

export default InlinePlanCard;