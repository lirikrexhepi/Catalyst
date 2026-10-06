import { useCallback, useRef, useState } from 'react';
import {
  GitBranches,
  GitCheckout,
  GitCommit,
  GitCreateBranch,
  GitFetch,
  GitPull,
  GitPush,
  GitStage,
  GitUnstage,
} from '../../../wailsjs/go/main/App';
import { domain } from '../../../wailsjs/go/models';

export type GitBusy = 'fetch' | 'pull' | 'push' | 'commit' | 'checkout' | 'stage' | null;

export interface GitNotice {
  text: string;
  tone: 'ok' | 'error';
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function useGitActions(lanePath: string | null, refresh: (silent?: boolean) => Promise<void>) {
  const [busy, setBusy] = useState<GitBusy>(null);
  const [notice, setNotice] = useState<GitNotice | null>(null);
  const [branches, setBranches] = useState<domain.BranchInfo[]>([]);
  const timer = useRef<number | undefined>(undefined);

  const say = useCallback((text: string, tone: GitNotice['tone']) => {
    setNotice({ text, tone });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNotice(null), tone === 'error' ? 6000 : 2200);
  }, []);

  const perform = useCallback(
    async (kind: Exclude<GitBusy, null>, task: () => Promise<void>, done?: string): Promise<boolean> => {
      if (!lanePath) return false;
      setBusy(kind);
      try {
        await task();
        if (done) say(done, 'ok');
        return true;
      } catch (cause) {
        say(message(cause), 'error');
        return false;
      } finally {
        await refresh(true);
        setBusy(null);
      }
    },
    [lanePath, refresh, say],
  );

  const stage = useCallback(
    (files: string[]) => perform('stage', () => GitStage(lanePath ?? '', files)),
    [lanePath, perform],
  );

  const unstage = useCallback(
    (files: string[]) => perform('stage', () => GitUnstage(lanePath ?? '', files)),
    [lanePath, perform],
  );

  const commit = useCallback(
    (summary: string, description: string, stageFirst: string[]) =>
      perform(
        'commit',
        async () => {
          if (stageFirst.length > 0) await GitStage(lanePath ?? '', stageFirst);
          await GitCommit(lanePath ?? '', summary, description);
        },
        'Committed',
      ),
    [lanePath, perform],
  );

  const fetchOrigin = useCallback(
    () => perform('fetch', () => GitFetch(lanePath ?? ''), 'Fetched origin'),
    [lanePath, perform],
  );
  const pull = useCallback(
    () => perform('pull', () => GitPull(lanePath ?? ''), 'Pulled from origin'),
    [lanePath, perform],
  );
  const push = useCallback(
    () => perform('push', () => GitPush(lanePath ?? ''), 'Pushed to origin'),
    [lanePath, perform],
  );

  const loadBranches = useCallback(async () => {
    if (!lanePath) return;
    try {
      setBranches((await GitBranches(lanePath)) ?? []);
    } catch (cause) {
      say(message(cause), 'error');
    }
  }, [lanePath, say]);

  const checkout = useCallback(
    (branch: string, mode: 'plain' | 'leave' | 'bring' = 'plain') =>
      perform('checkout', () => GitCheckout(lanePath ?? '', branch, mode), `Switched to ${branch}`),
    [lanePath, perform],
  );

  const createBranch = useCallback(
    (name: string) =>
      perform('checkout', () => GitCreateBranch(lanePath ?? '', name), `Created ${name}`),
    [lanePath, perform],
  );

  return {
    busy,
    notice,
    branches,
    stage,
    unstage,
    commit,
    fetchOrigin,
    pull,
    push,
    loadBranches,
    checkout,
    createBranch,
  };
}
