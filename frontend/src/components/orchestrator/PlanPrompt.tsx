import React, { useState } from 'react';
import { LiquidGlass } from '../../liquid-glass';
import { PendingPlan } from './useSpawner';
import { useOrchestratorStore } from './useOrchestratorStore';
import { TaskModelPicker } from './TaskModelPicker';

export interface PlanPromptProps {
  plan: PendingPlan;
  /** Model ids are indexed by task position; omitted entries use the default. */
  onConfirm: (useWorktree: boolean, modelIds: string[]) => void;
  onDismiss: () => void;
  className?: string;
}

/**
 * Confirmation shown when the orchestrator proposes delegating work. Spawning
 * starts real CLI processes and can create branches, so it is never automatic.
 */
export const PlanPrompt: React.FC<PlanPromptProps> = ({
  plan,
  onConfirm,
  onDismiss,
  className = '',
}) => {
  const [useWorktree, setUseWorktree] = useState(plan.canUseWorktree);
  const [openPickerIndex, setOpenPickerIndex] = useState<number | null>(null);

  const selectedModelId = useOrchestratorStore((state) => state.selectedModelId);

  // Every task starts on the model chosen in the bar; each can then be pointed
  // at a different agent before starting.
  const [modelIds, setModelIds] = useState<string[]>(() =>
    plan.tasks.map(() => selectedModelId),
  );

  const setModelFor = (index: number, modelId: string) =>
    setModelIds((previous) => previous.map((id, at) => (at === index ? modelId : id)));

  return (
    <LiquidGlass
      variant="panel"
      surface="squircle"
      radius={18}
      bezelWidth={18}
      glassThickness={24}
      refractionScale={0.8}
      blur={0.4}
      specularOpacity={0.8}
      specularSaturation={6}
      lightAngle={-45}
      tint="rgba(0, 0, 0, 0.22)"
      shadow="apple"
      border="1px solid rgba(255, 255, 255, 0.18)"
      className={`w-[580px] px-4.5 py-4 ${className}`}
      style={{
        boxShadow:
          '0 20px 54px rgba(0, 0, 0, 0.55), 0 4px 14px rgba(0, 0, 0, 0.35), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.25)',
      }}
    >
      <div className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-white/80 leading-none">
            account_tree
          </span>
          <span className="text-[13px] font-semibold font-['Geist'] text-white tracking-tight">
            Delegate {plan.tasks.length} task{plan.tasks.length === 1 ? '' : 's'}?
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 pb-3">
        {plan.tasks.map((task, index) => (
          <div
            key={`${task.title}-${index}`}
            className="flex items-start gap-2.5 p-2 rounded-[10px] bg-white/[0.04] border border-white/[0.08]"
          >
            <span className="text-[11px] font-semibold text-white/40 tabular-nums w-4 text-center pt-0.5 shrink-0">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1 flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium font-['Geist'] text-white/95 tracking-tight truncate">
                  {task.title}
                </span>

                {/* Custom Glass Model Picker for each task */}
                <TaskModelPicker
                  selectedModelId={modelIds[index] || selectedModelId}
                  onSelectModel={(newModelId) => setModelFor(index, newModelId)}
                  isOpen={openPickerIndex === index}
                  onToggle={() =>
                    setOpenPickerIndex((current) => (current === index ? null : index))
                  }
                  onClose={() => setOpenPickerIndex(null)}
                />
              </div>
              <div className="text-[11px] font-['Geist'] text-white/50 leading-relaxed line-clamp-2 select-text">
                {task.prompt}
              </div>
            </div>
          </div>
        ))}
      </div>

      {plan.canUseWorktree ? (
        <button
          type="button"
          onClick={() => setUseWorktree((prev) => !prev)}
          className="flex items-center gap-2 py-1.5 group cursor-pointer select-none"
        >
          <span
            className={`w-[15px] h-[15px] rounded-[4px] border flex items-center justify-center transition-colors ${
              useWorktree ? 'bg-white/85 border-white/85' : 'bg-white/5 border-white/25'
            }`}
          >
            {useWorktree && (
              <span className="material-symbols-outlined text-[12px] text-black leading-none">
                check
              </span>
            )}
          </span>
          <span className="text-[11px] font-['Geist'] text-white/60 group-hover:text-white/85 tracking-tight">
            Isolate each task in its own git worktree
          </span>
        </button>
      ) : (
        <div className="text-[11px] font-['Geist'] text-white/40 py-1.5">
          Not a git repository — agents will share the working directory.
        </div>
      )}

      <div className="flex items-center gap-2 pt-3">
        <button
          type="button"
          onClick={() => onConfirm(useWorktree, modelIds)}
          className="h-[28px] px-3.5 rounded-[8px] bg-white/90 hover:bg-white active:scale-95 text-[12px] font-semibold font-['Geist'] text-black tracking-tight transition-all duration-150 cursor-pointer shadow-sm"
        >
          Start agents
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="h-[28px] px-3.5 rounded-[8px] bg-white/8 hover:bg-white/15 active:scale-95 border border-white/12 text-[12px] font-medium font-['Geist'] text-white/70 hover:text-white tracking-tight transition-all duration-150 cursor-pointer"
        >
          Not now
        </button>
      </div>
    </LiquidGlass>
  );
};

export default PlanPrompt;
