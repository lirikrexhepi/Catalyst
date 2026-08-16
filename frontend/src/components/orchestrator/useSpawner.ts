import { useCallback, useEffect, useRef, useState } from 'react';
import { EventsOn } from '../../../wailsjs/runtime/runtime';
import {
  InterruptTurn,
  IsGitRepo,
  ParseTasks,
  SendTurn,
  SpawnTasks,
  StopSession,
} from '../../../wailsjs/go/main/App';
import { domain, session } from '../../../wailsjs/go/models';
import { AgentStreamBlock } from '../agent-session';
import { reduceEvent, RuntimeEvent, userBlock } from '../agent-session/eventReducer';
import { useOrchestratorStore } from './useOrchestratorStore';
import { toModelOptions } from './orchestratorData';

export interface PendingPlan {
  tasks: session.TaskRequest[];
  canUseWorktree: boolean;
}

export interface SpawnedTask {
  threadId: string;
  title: string;
  branch?: string;
  model?: string;
  blocks: AgentStreamBlock[];
  isBusy: boolean;
}

export interface Spawner {
  plan: PendingPlan | null;
  tasks: SpawnedTask[];
  error: string | null;
  /** Detects a delegation plan in an orchestrator reply. */
  inspect: (text: string) => Promise<void>;
  confirm: (useWorktree: boolean, modelIds?: string[]) => Promise<void>;
  dismiss: () => void;
  send: (threadId: string, text: string) => Promise<void>;
  interrupt: (threadId: string) => Promise<void>;
  close: (threadId: string) => Promise<void>;
  /** Drops every window after the backend has stopped their sessions. */
  clear: () => void;
}

const RUNTIME_CHANNEL = 'agent:event';

/**
 * Owns the delegation half of the orchestrator: recognising a plan, asking
 * about isolation, spawning the agents, and keeping each spawned session's
 * transcript up to date.
 */
export function useSpawner(): Spawner {
  const [plan, setPlan] = useState<PendingPlan | null>(null);
  const [tasks, setTasks] = useState<SpawnedTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const threads = useRef<Set<string>>(new Set());

  useEffect(() => {
    const off = EventsOn(RUNTIME_CHANNEL, (event: RuntimeEvent) => {
      if (!threads.current.has(event.threadId)) return;

      setTasks((previous) =>
        previous.map((task) => {
          if (task.threadId !== event.threadId) return task;
          const isBusy =
            event.kind === 'turn.completed' || event.kind === 'turn.failed'
              ? false
              : task.isBusy;
          return { ...task, blocks: reduceEvent(task.blocks, event), isBusy };
        }),
      );
    });
    return off;
  }, []);

  const inspect = useCallback(async (text: string) => {
    try {
      const parsed = await ParseTasks(text);
      if (!parsed || parsed.length === 0) return;

      const cwd = '';
      const canUseWorktree = await IsGitRepo(cwd).catch(() => false);
      setPlan({ tasks: parsed, canUseWorktree });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const confirm = useCallback(
    async (useWorktree: boolean, modelIds: string[] = []) => {
      if (!plan) return;
      const store = useOrchestratorStore.getState();
      const fallback = store.getSelectedModel();
      if (!fallback) {
        setError('No agent CLI available');
        return;
      }

      setPlan(null);
      setError(null);

      try {
        const result = await SpawnTasks(
          plan.tasks.map((task, index) => {
            // Each task may target a different agent; an unknown id falls back
            // to the model selected in the bar.
            const chosen = store.models.find((m) => m.id === modelIds[index]) ?? fallback;
            return {
              title: task.title,
              prompt: task.prompt,
              // Honours a directory the orchestrator picked out of the request,
              // so a task naming another project starts there.
              cwd: task.cwd ?? '',
              driver: chosen.providerId,
              model: chosen.id,
              options: toModelOptions(chosen, store.getCurrentModelSettings(chosen.id)),
            };
          }),
          {
            driver: fallback.providerId,
            model: fallback.id,
            options: toModelOptions(fallback, store.getCurrentModelSettings(fallback.id)),
            cwd: '',
            useWorktree,
            title: plan.tasks[0]?.title ?? 'Tasks',
            prompt: plan.tasks.map((task) => task.title).join(', '),
          },
        );

        for (const task of result.tasks) {
          threads.current.add(task.threadId);
        }
        setTasks((previous) => [
          ...previous,
          ...result.tasks.map((task, index) => {
            const initialPrompt = plan.tasks[index]?.prompt || task.prompt;
            return {
              threadId: task.threadId,
              title: task.title,
              branch: task.worktree?.branch,
              model: task.model,
              blocks: initialPrompt
                ? [userBlock(initialPrompt, `orch-prompt-${task.threadId}`)]
                : ([] as AgentStreamBlock[]),
              isBusy: true,
            };
          }),
        ]);

        if (result.errors?.length) setError(result.errors.join('\n'));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [plan],
  );

  const dismiss = useCallback(() => setPlan(null), []);

  const send = useCallback(async (threadId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const turnId = `${threadId}-turn-${Date.now()}`;
    setTasks((previous) =>
      previous.map((task) =>
        task.threadId === threadId
          ? {
              ...task,
              isBusy: true,
              blocks: [...task.blocks, userBlock(trimmed, `user-${Date.now()}`)],
            }
          : task,
      ),
    );

    try {
      await SendTurn(domain.SendTurnInput.createFrom({ threadId, turnId, text: trimmed }));
    } catch (cause) {
      setTasks((previous) =>
        previous.map((task) => (task.threadId === threadId ? { ...task, isBusy: false } : task)),
      );
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const interrupt = useCallback(async (threadId: string) => {
    try {
      await InterruptTurn(threadId);
    } catch {
      // The turn may already have finished; the state update below still applies.
    }
    setTasks((previous) =>
      previous.map((task) => (task.threadId === threadId ? { ...task, isBusy: false } : task)),
    );
  }, []);

  const close = useCallback(async (threadId: string) => {
    threads.current.delete(threadId);
    setTasks((previous) => previous.filter((task) => task.threadId !== threadId));
    try {
      await StopSession(threadId);
    } catch {
      // Closing the window is the user's intent regardless of teardown result.
    }
  }, []);

  const clear = useCallback(() => {
    threads.current = new Set();
    setTasks([]);
    setPlan(null);
    setError(null);
  }, []);

  return { plan, tasks, error, inspect, confirm, dismiss, send, interrupt, close, clear };
}
