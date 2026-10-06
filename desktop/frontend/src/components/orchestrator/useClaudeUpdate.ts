import { useCallback, useEffect, useState } from 'react';
import { ClaudeUpdateStatus, UpdateClaudeCode } from '../../../wailsjs/go/main/App';
import { domain } from '../../../wailsjs/go/models';
import { EventsOn } from '../../../wailsjs/runtime/runtime';
import { useOrchestratorStore } from './useOrchestratorStore';

export type ClaudeUpdate = domain.ProviderUpdate;

const DISMISSED_KEY = 'orchestrator_claude_update_dismissed';

function readDismissed(): string {
  try {
    return localStorage.getItem(DISMISSED_KEY) || '';
  } catch {
    return '';
  }
}

export interface ClaudeUpdateState {
  status: ClaudeUpdate | null;
  updating: boolean;
  output: string | null;
  error: string | null;
  dismissed: string;
  refresh: () => Promise<void>;
  startUpdate: () => Promise<boolean>;
  dismiss: () => void;
}

/**
 * Tracks the Claude Code release advisory: a force-fresh check on mount and
 * whenever the backend watcher announces a newer release, plus the one-click
 * update that re-probes providers afterwards.
 */
export function useClaudeUpdate(): ClaudeUpdateState {
  const [status, setStatus] = useState<ClaudeUpdate | null>(null);
  const [updating, setUpdating] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(readDismissed);

  const refresh = useCallback(async () => {
    try {
      const next = await ClaudeUpdateStatus();
      setStatus(next ?? null);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
    return EventsOn('cli:update-available', () => void refresh());
  }, [refresh]);

  const startUpdate = useCallback(async () => {
    setUpdating(true);
    setOutput(null);
    try {
      const result = await UpdateClaudeCode();
      setOutput(result || 'Updated');
      setError(null);
      await useOrchestratorStore.getState().loadProviders(true);
      await refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setUpdating(false);
    }
  }, [refresh]);

  const dismiss = useCallback(() => {
    const latest = status?.latest ?? '';
    try {
      if (latest) localStorage.setItem(DISMISSED_KEY, latest);
    } catch {
      return;
    }
    setDismissed(latest);
  }, [status?.latest]);

  return { status, updating, output, error, dismissed, refresh, startUpdate, dismiss };
}
