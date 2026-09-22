import { useCallback, useEffect, useRef, useState } from 'react';
import { EventsOn } from '../../../wailsjs/runtime/runtime';
import {
	ActiveProject,
	CoordinatorHistory,
  CoordinatorInterrupt,
  CoordinatorSendFiles,
} from '../../../wailsjs/go/main/App';
import { domain } from '../../../wailsjs/go/models';
import { AgentStreamBlock } from '../agent-session';
import { reduceEvent, RuntimeEvent, userBlock } from '../agent-session/eventReducer';
import { useOrchestratorStore } from './useOrchestratorStore';
import { toModelOptions } from './orchestratorData';

const COORDINATOR_THREAD = 'coordinator';

/** Last path segment, for showing an attachment by name rather than full path. */
function fileName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
const RUNTIME_CHANNEL = 'agent:event';

export interface Coordinator {
  blocks: AgentStreamBlock[];
  isBusy: boolean;
  error: string | null;
  send: (text: string, files?: domain.FileRef[]) => Promise<void>;
  interrupt: () => Promise<void>;
  /** Drops the transcript after the backend session has been reset. */
  clear: () => void;
}

export interface CoordinatorOptions {
  onReply?: (text: string) => void;
}

/**
 * Bridges the coordinator thread to the UI: streams runtime events into
 * renderable blocks and sends messages using the current model selection.
 */
export function useCoordinator(options: CoordinatorOptions = {}): Coordinator {
  const [blocks, setBlocks] = useState<AgentStreamBlock[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingTurn = useRef<string | null>(null);
  const lastModelId = useRef<string | null>(null);
  const replyText = useRef('');
  const onReply = useRef(options.onReply);
  onReply.current = options.onReply;

  // Track the selection so a switch is detected on the very next send. Seeding
  // this from a mount effect would miss it, because providers are discovered
  // asynchronously and nothing is selected yet when the hook first runs.
  useEffect(
    () =>
      useOrchestratorStore.subscribe((state) => {
        if (lastModelId.current === null && state.selectedModelId) {
          lastModelId.current = state.selectedModelId;
        }
      }),
    [],
  );

  useEffect(() => {
    let active = true;

    CoordinatorHistory()
      .then((history) => {
        if (!active || history.length === 0) return;
        setBlocks(history.reduce<AgentStreamBlock[]>(reduceEvent, []));
      })
      .catch(() => undefined);

    const off = EventsOn(RUNTIME_CHANNEL, (event: RuntimeEvent) => {
      if (event.threadId !== COORDINATOR_THREAD) return;

      setBlocks((previous) => reduceEvent(previous, event));

      if (event.kind === 'agent.message' && event.text) {
        replyText.current = event.delta ? replyText.current + event.text : event.text;
      }

      if (event.kind === 'turn.completed' || event.kind === 'turn.failed') {
        if (event.kind === 'turn.completed' && replyText.current) {
          onReply.current?.(replyText.current);
        }
        replyText.current = '';
        if (!pendingTurn.current || pendingTurn.current === event.turnId) {
          pendingTurn.current = null;
          setIsBusy(false);
        }
        if (event.kind === 'turn.failed' && event.error) setError(event.error);
      }
    });

    return () => {
      active = false;
      off();
    };
  }, []);

  const send = useCallback(async (text: string, files: domain.FileRef[] = []) => {
    const trimmed = text.trim();
    // An attachment with no text is still a message worth sending.
    if (!trimmed && files.length === 0) return;

    const store = useOrchestratorStore.getState();
    const model = store.getSelectedModel();
    if (!model) {
      setError('No agent CLI available');
      return;
    }

    setError(null);
    setIsBusy(true);

    const stamp = Date.now();
    setBlocks((previous) => {
      // Mark a switch inline so the transcript explains why later replies come
      // from a different agent. The divider is only meaningful once there is
      // earlier conversation to separate from.
      const changed = false;
      const notice =
        changed && previous.length > 0
          ? [
              {
                type: 'notice' as const,
                id: `notice-${stamp}`,
                label: `Changed model to ${model.name}`,
                icon: model.icon,
              },
            ]
          : [];
      return [
        ...previous,
        ...notice,
        userBlock(trimmed, `user-${stamp}`, files, stamp),
      ];
    });
    lastModelId.current = model.id;

    try {
	  // Resolve the folder at send time rather than trusting a render-time
	  // snapshot. Project selection is asynchronous, so this closes the window
	  // where a new chat could otherwise start in the desktop launch directory.
	  const project = await ActiveProject();
	  if (!project?.path) {
	    throw new Error('Choose a project folder before starting a chat');
	  }
      const turnId = await CoordinatorSendFiles(
        {
          driver: model.providerId,
          model: model.id,
          options: toModelOptions(model, store.getCurrentModelSettings(model.id)),
          permissionMode: store.autoApprovePermissions ? 'bypassPermissions' : 'default',
		  cwd: project.path,
        },
        trimmed,
        files,
      );
      pendingTurn.current = turnId;
    } catch (cause) {
      pendingTurn.current = null;
      setIsBusy(false);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const interrupt = useCallback(async () => {
    try {
      await CoordinatorInterrupt();
    } finally {
      pendingTurn.current = null;
      setIsBusy(false);
    }
  }, []);

  const clear = useCallback(() => {
    setBlocks([]);
    setError(null);
    setIsBusy(false);
    pendingTurn.current = null;
    replyText.current = '';
  }, []);

  return { blocks, isBusy, error, send, interrupt, clear };
}
