import { useCallback, useEffect, useRef, useState } from 'react';
import { EventsOn } from '../../../wailsjs/runtime/runtime';
import { ResetUsage, UsageReport } from '../../../wailsjs/go/main/App';
import { session } from '../../../wailsjs/go/models';

const RUNTIME_CHANNEL = 'agent:event';
const REFRESH_MS = 900;
const IDLE_REFRESH_MS = 10_000;

export interface Usage {
  report: session.UsageReport | null;
  error: string | null;
  /** Re-reads quota and counters without discarding anything. */
  refresh: () => Promise<void>;
  /** Clears token counters; subscription quota is re-read, not cleared. */
  reset: () => Promise<void>;
}

/**
 * Keeps the usage report fresh while the panel is open.
 *
 * Totals are recomputed on the Go side, so this only decides when to ask. It
 * polls on a coarse interval rather than refetching per runtime event: a busy
 * agent emits hundreds of events a second and each would otherwise cross the
 * bridge for a number the user cannot read that fast.
 */
export function useUsage(isOpen: boolean): Usage {
  const [report, setReport] = useState<session.UsageReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirty = useRef(true);

  const load = useCallback(async () => {
    try {
      setReport(await UsageReport());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void load();
  }, [isOpen, load]);

  // Agent events drive a fast re-read so token counters track a running agent.
  // A slow beat runs regardless, because the CLI's quota cache is rewritten by
  // other Claude clients and nothing in Catalyst observes that happening.
  useEffect(() => {
    if (!isOpen) return;
    const off = EventsOn(RUNTIME_CHANNEL, () => {
      dirty.current = true;
    });
    const fast = window.setInterval(() => {
      if (!dirty.current) return;
      dirty.current = false;
      void load();
    }, REFRESH_MS);
    const slow = window.setInterval(() => void load(), IDLE_REFRESH_MS);

    return () => {
      off();
      window.clearInterval(fast);
      window.clearInterval(slow);
    };
  }, [isOpen, load]);

  const reset = useCallback(async () => {
    try {
      setReport(await ResetUsage());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  return { report, error, refresh: load, reset };
}
