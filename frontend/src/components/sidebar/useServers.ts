import { useCallback, useEffect, useState } from 'react';
import { ListServers, StopServer } from '../../../wailsjs/go/main/App';
import { servers } from '../../../wailsjs/go/models';

const POLL_MS = 4_000;

export interface Servers {
  groups: servers.Group[];
  error: string | null;
  isLoading: boolean;
  stopping: number | null;
  refresh: () => Promise<void>;
  stop: (pid: number) => Promise<void>;
}

/**
 * Tracks listening servers while the panel is open.
 *
 * Polled rather than event-driven: a server can be started or die by any means,
 * including outside Catalyst, so there is no event to subscribe to.
 */
export function useServers(isOpen: boolean): Servers {
  const [groups, setGroups] = useState<servers.Group[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [stopping, setStopping] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      setGroups(await ListServers());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    void refresh().finally(() => setLoading(false));

    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [isOpen, refresh]);

  const stop = useCallback(
    async (pid: number) => {
      setStopping(pid);
      try {
        await StopServer(pid);
        // The process takes a moment to release its socket, so the list is
        // re-read rather than optimistically pruned.
        await refresh();
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setStopping(null);
      }
    },
    [refresh],
  );

  return { groups, error, isLoading, stopping, refresh, stop };
}
