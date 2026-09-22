import { useCallback, useState } from 'react';
import {
  ImportClaudeCodeSession,
  ListClaudeCodeSessions,
} from '../../../wailsjs/go/main/App';
import { claudeimport } from '../../../wailsjs/go/models';

export interface ClaudeImportState {
  sessions: claudeimport.ExternalSession[];
  isLoading: boolean;
  isImporting: boolean;
  error: string | null;
  list: () => Promise<void>;
  importOne: (filePath: string) => Promise<string | null>;
  reset: () => void;
}

/**
 * Owns the Claude Code import picker: listing outside transcripts and
 * bringing one into history as a read-only workspace.
 */
export function useClaudeImport(): ClaudeImportState {
  const [sessions, setSessions] = useState<claudeimport.ExternalSession[]>([]);
  const [isLoading, setLoading] = useState(false);
  const [isImporting, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useCallback(async () => {
    setLoading(true);
    try {
      setSessions((await ListClaudeCodeSessions()) ?? []);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  const importOne = useCallback(async (filePath: string): Promise<string | null> => {
    setImporting(true);
    try {
      const workspaceId = await ImportClaudeCodeSession(filePath);
      setError(null);
      return workspaceId ?? null;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return null;
    } finally {
      setImporting(false);
    }
  }, []);

  const reset = useCallback(() => {
    setSessions([]);
    setError(null);
  }, []);

  return { sessions, isLoading, isImporting, error, list, importOne, reset };
}
