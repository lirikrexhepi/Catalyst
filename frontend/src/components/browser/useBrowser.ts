import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListServers } from '../../../wailsjs/go/main/App';
import { servers } from '../../../wailsjs/go/models';

const POLL_MS = 4_000;

export interface BrowserTab {
  id: string;
  url: string;
  /** Bumped to force a remount of the frame, which is how reload works for a cross-origin iframe. */
  nonce: number;
  /** Set once a load has visibly failed or been refused, so the surface can offer an escape hatch. */
  blocked: boolean;
}

export interface BrowserAgent {
  threadId: string;
  title: string;
  tabs: BrowserTab[];
  activeTabId: string;
  /** Ports discovered for this agent, offered as one-click destinations. */
  ports: number[];
  /** False for the catch-all lane holding servers with no agent behind them. */
  isAgent: boolean;
  /** Mirrors the agent's turn state so the lane can show it is still working. */
  isBusy: boolean;
}

export interface BrowserState {
  agents: BrowserAgent[];
  activeAgentId: string | null;
  activeAgent: BrowserAgent | null;
  activeTab: BrowserTab | null;
  error: string | null;
  selectAgent: (threadId: string) => void;
  selectTab: (tabId: string) => void;
  openTab: (url?: string) => void;
  closeTab: (tabId: string) => void;
  navigate: (url: string) => void;
  reload: () => void;
  markBlocked: (tabId: string) => void;
}

const BLANK = 'about:blank';

// Lane key and label for listeners the scan could not trace back to an agent.
const UNOWNED = '__unowned__';
const UNOWNED_TITLE = 'Other servers';

let tabSeq = 0;
function newTab(url: string = BLANK): BrowserTab {
  tabSeq += 1;
  return { id: `tab-${tabSeq}`, url, nonce: 0, blocked: false };
}

/**
 * Accepts what a person actually types. A bare host or `localhost:5173` is not a
 * valid URL until it has a scheme, and prefixing https on a loopback address
 * would fail against a plain-HTTP dev server.
 */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return BLANK;

  // A bare `host:port` parses as scheme + path, so the port form is claimed
  // before the scheme check — otherwise `localhost:5173` is read as the scheme
  // `localhost:` and passed through unusable.
  if (/^\d+$/.test(trimmed)) return `http://localhost:${trimmed}`;
  if (/^:\d+/.test(trimmed)) return `http://localhost${trimmed}`;

  const hostPort = /^([a-z0-9.-]+|\[[0-9a-f:]+\]):(\d+)(.*)$/i.exec(trimmed);
  if (hostPort) {
    const [, host, port, rest] = hostPort;
    return `${isLoopbackHost(host) ? 'http' : 'https'}://${host}:${port}${rest}`;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `${isLoopbackHost(trimmed.split('/')[0]) ? 'http' : 'https'}://${trimmed}`;
}

// Loopback and private addresses are served over plain HTTP by every dev server
// worth previewing, so forcing https on them would break the common case.
function isLoopbackHost(host: string): boolean {
  return (
    /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|::1)$/i.test(host) ||
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
    /\.local$/i.test(host)
  );
}

/** The address bar shows a port for loopback URLs; a full origin is noise for a dev server. */
export function displayUrl(url: string): string {
  if (!url || url === BLANK) return '';
  return url;
}

/**
 * Owns the browser's two-level tab model: one lane per agent, each holding its
 * own tabs.
 *
 * Agents come from the same scan that powers the Servers panel, which already
 * attributes a listening port to the agent whose process tree started it. That
 * attribution is the whole point of the feature: two agents working the same
 * repo in separate worktrees each get their own preview without anyone typing a
 * port.
 */
export function useBrowser(isOpen: boolean, busyThreadIds: string[] = []): BrowserState {
  const [agents, setAgents] = useState<BrowserAgent[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Ports already turned into a tab, so a rescan never reopens one the user closed.
  const seededPorts = useRef<Map<string, Set<number>>>(new Map());

  const refresh = useCallback(async () => {
    try {
      const groups: servers.Group[] = await ListServers();
      setError(null);

      setAgents((previous) => {
        const byThread = new Map(previous.map((agent) => [agent.threadId, agent]));
        const next: BrowserAgent[] = [];

        for (const group of groups) {
          // Servers with no agent ancestor still get a lane. Attribution depends
          // on the agent CLI exposing its PID and, for turn-scoped CLIs, on the
          // turn still running — so a perfectly good dev server routinely lands
          // here. Dropping it would leave the browser looking broken.
          const key = group.threadId || UNOWNED;
          // The agent CLI's own IPC socket is not a page, so it is never offered
          // as a destination.
          const ports = (group.servers ?? [])
            .filter((server) => !server.agent)
            .map((server) => server.port)
            .sort((a, b) => a - b);
          if (ports.length === 0 && !byThread.has(key)) continue;

          const existing = byThread.get(key);

          let seeded = seededPorts.current.get(key);
          if (!seeded) {
            seeded = new Set<number>();
            seededPorts.current.set(key, seeded);
          }

          if (!existing) {
            // A brand new agent opens straight onto its lowest port, so the
            // common case needs no interaction at all.
            const first = ports[0];
            if (first !== undefined) seeded.add(first);
            const tab = newTab(first !== undefined ? `http://localhost:${first}` : BLANK);
            next.push({
              threadId: key,
              title: group.threadId ? group.title || key : UNOWNED_TITLE,
              tabs: [tab],
              activeTabId: tab.id,
              ports,
              isAgent: !!group.threadId,
              isBusy: false,
            });
            continue;
          }

          // An agent that starts a second server mid-task gets a tab for it,
          // but only the first time that port is seen.
          const fresh = ports.filter((port) => !seeded.has(port));
          let tabs = existing.tabs;
          let activeTabId = existing.activeTabId;

          const isPlaceholderOnly = tabs.length === 1 && tabs[0].url === BLANK;
          for (const port of fresh) {
            seeded.add(port);
            const tab = newTab(`http://localhost:${port}`);
            tabs = isPlaceholderOnly && tabs[0].id === activeTabId ? [tab] : [...tabs, tab];
            activeTabId = tab.id;
          }

          next.push({
            ...existing,
            title: group.threadId ? group.title || existing.title : UNOWNED_TITLE,
            tabs,
            activeTabId,
            ports,
          });
        }

        // Keep lanes for agents the scan no longer reports: a dev server that
        // exits should not silently discard the tabs someone opened against it.
        for (const agent of previous) {
          if (!next.some((candidate) => candidate.threadId === agent.threadId)) {
            next.push({ ...agent, ports: [] });
          }
        }

        // Agents first; the catch-all lane is the least interesting and belongs last.
        next.sort((a, b) => Number(a.threadId === UNOWNED) - Number(b.threadId === UNOWNED));
        return next;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [isOpen, refresh]);

  // Selection follows the list rather than leading it, so a closed agent never
  // leaves the surface pointing at a lane that is gone.
  useEffect(() => {
    if (agents.length === 0) {
      if (activeAgentId !== null) setActiveAgentId(null);
      return;
    }
    if (!activeAgentId || !agents.some((agent) => agent.threadId === activeAgentId)) {
      setActiveAgentId(agents[0].threadId);
    }
  }, [agents, activeAgentId]);

  const updateActive = useCallback(
    (change: (agent: BrowserAgent) => BrowserAgent) => {
      setAgents((previous) =>
        previous.map((agent) => (agent.threadId === activeAgentId ? change(agent) : agent)),
      );
    },
    [activeAgentId],
  );

  const selectAgent = useCallback((threadId: string) => setActiveAgentId(threadId), []);

  const selectTab = useCallback(
    (tabId: string) => updateActive((agent) => ({ ...agent, activeTabId: tabId })),
    [updateActive],
  );

  const openTab = useCallback(
    (url?: string) =>
      updateActive((agent) => {
        const tab = newTab(url ? normalizeUrl(url) : BLANK);
        return { ...agent, tabs: [...agent.tabs, tab], activeTabId: tab.id };
      }),
    [updateActive],
  );

  const closeTab = useCallback(
    (tabId: string) =>
      updateActive((agent) => {
        const index = agent.tabs.findIndex((tab) => tab.id === tabId);
        if (index === -1) return agent;

        const tabs = agent.tabs.filter((tab) => tab.id !== tabId);
        // A lane with no tabs has nothing to render, so closing the last one
        // leaves a blank tab rather than an empty surface.
        if (tabs.length === 0) {
          const tab = newTab();
          return { ...agent, tabs: [tab], activeTabId: tab.id };
        }
        const activeTabId =
          agent.activeTabId === tabId
            ? tabs[Math.min(index, tabs.length - 1)].id
            : agent.activeTabId;
        return { ...agent, tabs, activeTabId };
      }),
    [updateActive],
  );

  const navigate = useCallback(
    (url: string) =>
      updateActive((agent) => ({
        ...agent,
        tabs: agent.tabs.map((tab) =>
          tab.id === agent.activeTabId
            ? { ...tab, url: normalizeUrl(url), nonce: tab.nonce + 1, blocked: false }
            : tab,
        ),
      })),
    [updateActive],
  );

  const reload = useCallback(
    () =>
      updateActive((agent) => ({
        ...agent,
        tabs: agent.tabs.map((tab) =>
          tab.id === agent.activeTabId
            ? { ...tab, nonce: tab.nonce + 1, blocked: false }
            : tab,
        ),
      })),
    [updateActive],
  );

  const markBlocked = useCallback(
    (tabId: string) =>
      updateActive((agent) => ({
        ...agent,
        tabs: agent.tabs.map((tab) => (tab.id === tabId ? { ...tab, blocked: true } : tab)),
      })),
    [updateActive],
  );

  // Busy state is layered on at read time rather than folded into the polled
  // lanes: turn events arrive on their own clock, and a dot that only caught up
  // on the next 4s scan would lag the agent window beside it.
  const busyKey = busyThreadIds.join(',');
  const decorated = useMemo(() => {
    const busy = new Set(busyThreadIds);
    return agents.map((agent) => ({ ...agent, isBusy: busy.has(agent.threadId) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, busyKey]);

  const activeAgent = useMemo(
    () => decorated.find((agent) => agent.threadId === activeAgentId) ?? null,
    [decorated, activeAgentId],
  );
  const activeTab = useMemo(
    () => activeAgent?.tabs.find((tab) => tab.id === activeAgent.activeTabId) ?? null,
    [activeAgent],
  );

  return {
    agents: decorated,
    activeAgentId,
    activeAgent,
    activeTab,
    error,
    selectAgent,
    selectTab,
    openTab,
    closeTab,
    navigate,
    reload,
    markBlocked,
  };
}
