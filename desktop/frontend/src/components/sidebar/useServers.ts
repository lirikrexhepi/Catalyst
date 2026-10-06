import { useCallback, useEffect, useState } from 'react';
import { ListServers, StopServer } from '../../../wailsjs/go/main/App';
import { EventsOn } from '../../../wailsjs/runtime/runtime';
import { servers } from '../../../wailsjs/go/models';

const POLL_MS = 10_000;

export interface Servers {
  groups: servers.Group[];
  error: string | null;
  isLoading: boolean;
  stopping: number | null;
  refresh: () => Promise<void>;
  stop: (pid: number) => Promise<void>;
}

/**
 * Tracks listening servers while the panel is open or actively queried.
 *
 * Supported by both real-time events (when managed servers start/detect ports)
 * and background polling (for processes spawned externally).
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

    // Instant update whenever Go emits a server change or port detection:
    const cancelEvent = EventsOn('servers:changed', () => {
      void refresh();
    });

    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => {
      window.clearInterval(timer);
      if (cancelEvent) cancelEvent();
    };
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
