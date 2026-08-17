import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  OrchestratorInput,
  CoordinatorPanel,
  PlanPrompt,
  useCoordinator,
  useSpawner,
} from '../orchestrator';
import { AgentWindow } from '../agent-session';
import { BrowserWindow, useBrowser } from '../browser';
import { HistoryPanel, RestoredSessionBar, useHistory } from '../history';
import {
  ServersPanel,
  SettingsPanel,
  Sidebar,
  SidebarPanel,
  UsagePanel,
  useDefaultModels,
  useServers,
  useUsage,
  useWallpaper,
} from '../sidebar';

export interface SceneProps {
  children?: React.ReactNode;
}

// Everything except the image itself is stable, so the object identity only
// changes when the wallpaper does — every glass surface samples this layer, and
// a new style object each render would invalidate their cached backdrops.
const SCENE_BG_BASE: React.CSSProperties = {
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
  transform: 'translateZ(0)',
  backfaceVisibility: 'hidden',
};

const AGENT_WINDOW_SIZE = { width: 520, height: 620 };

// Windows tile left-to-right and wrap to a new row, so spawning several never
// stacks them directly on top of each other. Each row is nudged right to keep
// the wrap visually distinct.
// Clears the left rail so a spawned window never lands underneath it.
const RAIL_GUTTER = 108;

// The browser docks to the right edge rather than floating centred: it is a
// reference surface you watch while agents work, so it should sit beside them
// instead of covering them. Sized off the viewport so it stays a panel on a
// small window and never grows into a fullscreen sheet on a large one.
const BROWSER_MARGIN = 24;
const BROWSER_TOP = 96;

function browserGeometry() {
  const screenW = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const screenH = typeof window !== 'undefined' ? window.innerHeight : 900;

  const width = Math.round(Math.min(560, Math.max(420, screenW * 0.34)));
  const height = Math.round(Math.min(screenH - BROWSER_TOP - BROWSER_MARGIN, screenH * 0.78));

  return {
    size: { width, height },
    position: { x: Math.max(RAIL_GUTTER, screenW - width - BROWSER_MARGIN), y: BROWSER_TOP },
  };
}

// `reserved` is the width the docked browser occupies on the right, so newly
// spawned agents tile into what is left rather than landing underneath it.
function cascadePosition(index: number, reserved = 0) {
  const gap = 18;
  const top = 150;
  const columnWidth = AGENT_WINDOW_SIZE.width + gap;

  const available = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const usable = available - reserved;
  const perRow = Math.max(1, Math.floor((usable - RAIL_GUTTER - gap) / columnWidth));
  const row = Math.floor(index / perRow);
  const column = index % perRow;

  return {
    x: RAIL_GUTTER + column * columnWidth + row * 32,
    y: top + row * 44,
  };
}

export const Scene: React.FC<SceneProps> = ({ children }) => {
  const spawner = useSpawner();
  // Every orchestrator reply is inspected for a delegation plan; ordinary
  // answers parse to nothing and are ignored.
  const coordinator = useCoordinator({ onReply: spawner.inspect });

  const [isPanelCollapsed, setPanelCollapsed] = useState(false);
  const togglePanel = useCallback(() => setPanelCollapsed((prev) => !prev), []);

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  // History and GitHub have no panel yet; their rails toggle the highlight and
  // render nothing until each is built.
  const [activePanel, setActivePanel] = useState<SidebarPanel | null>(null);
  const usage = useUsage(activePanel === 'usage');
  const runningServers = useServers(activePanel === 'terminal');
  const wallpaper = useWallpaper();
  const defaultModels = useDefaultModels(activePanel === 'settings');
  // Both sides of the screen are dropped together: the agent windows and the
  // orchestrator transcript belong to the session that just ended.
  const clearSession = useCallback(() => {
    spawner.clear();
    coordinator.clear();
    setActiveThreadId(null);
    setPanelCollapsed(false);
  }, [spawner, coordinator]);
  const historyState = useHistory(activePanel === 'history', clearSession);

  // The browser is a window rather than a rail panel, so the rail toggles it and
  // it then lives on independently of which panel is showing.
  const [isBrowserOpen, setBrowserOpen] = useState(false);
  // Recomputed only when a task's busy flag flips, so the browser's indicators
  // do not re-derive on every streamed block.
  const busyThreadIds = useMemo(
    () => spawner.tasks.filter((task) => task.isBusy).map((task) => task.threadId),
    [spawner.tasks],
  );
  const browser = useBrowser(isBrowserOpen, busyThreadIds);
  // Geometry is resolved once per open so a viewport resize never yanks a window
  // the user has since dragged somewhere else.
  const [browserGeom, setBrowserGeom] = useState(browserGeometry);

  const backgroundStyle = useMemo<React.CSSProperties>(
    () =>
      wallpaper.selected
        ? { ...SCENE_BG_BASE, backgroundImage: `url(${wallpaper.selected.url})` }
        : SCENE_BG_BASE,
    [wallpaper.selected],
  );
  const selectPanel = useCallback((panel: SidebarPanel) => {
    // The browser is the one rail entry that opens a window instead of a panel,
    // so it toggles its own visibility and leaves the panel selection alone.
    if (panel === 'browser') {
      setBrowserOpen((open) => {
        if (!open) setBrowserGeom(browserGeometry());
        return !open;
      });
      return;
    }
    setActivePanel((current) => (current === panel ? null : panel));
  }, []);
  const closePanel = useCallback(() => setActivePanel(null), []);

  // Once agents are on screen they are the thing worth watching, so the
  // transcript that produced them folds away to make room.
  const spawnedCount = spawner.tasks.length;
  const previousSpawnedCount = useRef(spawnedCount);
  useEffect(() => {
    if (spawnedCount > previousSpawnedCount.current) setPanelCollapsed(true);
    previousSpawnedCount.current = spawnedCount;
  }, [spawnedCount]);

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none bg-black flex flex-col items-center">
      {/* The backdrop every glass surface samples. Kept on its own static compositor
          layer so window drags and feed scrolls never repaint the photo itself. */}
      <div className="absolute inset-0 z-0 pointer-events-none" style={backgroundStyle} />

      {/* Coordinator: input bar, its transcript, and any pending delegation.
          Outer container is pointer-events-none so clicks on empty space pass straight
          through to agent windows behind and beside it. */}
      {/* Clears the frameless window's drag strip so the input never sits under
          it and steal its own clicks. */}
      <div className="absolute top-10 z-40 flex flex-col items-center gap-2.5 w-full px-4 pointer-events-none">
        <div className="pointer-events-auto">
          <OrchestratorInput
            onSubmit={coordinator.send}
            onInterrupt={coordinator.interrupt}
            isBusy={coordinator.isBusy}
          />
        </div>
        <div className="pointer-events-auto">
          {/* A reopened session shows the orchestrator conversation that created
              it, in place of the live one. Restoring the agents without the
              request behind them loses the reason they exist. */}
          <CoordinatorPanel
            blocks={historyState.restored?.coordinatorBlocks ?? coordinator.blocks}
            isBusy={historyState.restored ? false : coordinator.isBusy}
            error={coordinator.error ?? spawner.error ?? historyState.error}
            isCollapsed={isPanelCollapsed}
            onToggleCollapsed={togglePanel}
          />
        </div>

        {historyState.restored && (
          <div className="pointer-events-auto">
            <RestoredSessionBar
              session={historyState.restored}
              isResuming={historyState.isResuming}
              onResume={() => historyState.resume(historyState.restored!.workspaceId)}
              onClose={historyState.close}
            />
          </div>
        )}
        {spawner.plan && (
          <div className="pointer-events-auto">
            <PlanPrompt
              plan={spawner.plan}
              onConfirm={spawner.confirm}
              onDismiss={spawner.dismiss}
            />
          </div>
        )}
      </div>

      {/* The rail owns its own centring. Wrapping it and the panel in one
          centred row made the rail shift whenever a taller panel mounted, since
          the row's height — and therefore its midpoint — changed with it. */}
      <div className="absolute left-5 top-1/2 -translate-y-1/2 z-40 pointer-events-auto">
        <Sidebar
          activePanel={isBrowserOpen && !activePanel ? 'browser' : activePanel}
          onSelect={selectPanel}
        />
      </div>

      {activePanel === 'history' && (
        <div className="absolute left-[86px] top-1/2 -translate-y-1/2 z-40 pointer-events-auto">
          <HistoryPanel
            entries={historyState.entries}
            isLoading={historyState.isLoading}
            error={historyState.error}
            activeWorkspaceId={historyState.restored?.workspaceId}
            hasLiveAgents={spawner.tasks.length > 0}
            onOpen={historyState.open}
            onDelete={historyState.remove}
            onNewChat={historyState.newChat}
            onRefresh={historyState.refresh}
            onClose={closePanel}
          />
        </div>
      )}

      {activePanel === 'usage' && (
        <div className="absolute left-[86px] top-1/2 -translate-y-1/2 z-40 pointer-events-auto">
          <UsagePanel
            report={usage.report}
            error={usage.error}
            onRefresh={usage.refresh}
            onReset={usage.reset}
            onClose={closePanel}
          />
        </div>
      )}

      {activePanel === 'terminal' && (
        <div className="absolute left-[86px] top-1/2 -translate-y-1/2 z-40 pointer-events-auto">
          <ServersPanel
            groups={runningServers.groups}
            error={runningServers.error}
            isLoading={runningServers.isLoading}
            stopping={runningServers.stopping}
            onStop={runningServers.stop}
            onRefresh={runningServers.refresh}
            onClose={closePanel}
          />
        </div>
      )}

      {activePanel === 'settings' && (
        <div className="absolute left-[86px] top-1/2 -translate-y-1/2 z-40 pointer-events-auto">
          <SettingsPanel
            wallpaper={wallpaper}
            defaultModels={defaultModels}
            onClose={closePanel}
          />
        </div>
      )}

      {/* A reopened session: every agent from that workspace, restored beside the
          orchestrator conversation that produced them. Rendered in the same layer
          as live windows so both behave identically. */}
      {historyState.restored && (
        <div className="absolute inset-0 z-20 pointer-events-none">
          {historyState.restored.tasks.map((task, index) => (
            <AgentWindow
              key={task.threadId}
              id={task.threadId}
              title={task.branch ? `${task.title} · ${task.branch}` : task.title}
              status={task.isLive ? 'idle' : 'finished'}
              initialSize={AGENT_WINDOW_SIZE}
              initialPosition={cascadePosition(
                index,
                isBrowserOpen ? browserGeom.size.width + BROWSER_MARGIN : 0,
              )}
              modelId={task.model}
              streamBlocks={task.blocks}
              isFocused={activeThreadId === task.threadId}
              onFocus={() => setActiveThreadId(task.threadId)}
              // Only a resumed agent has a CLI behind it; a replay has nothing
              // to send to, so the input stays inert rather than failing.
              onSendMessage={
                task.isLive ? (text) => spawner.send(task.threadId, text) : undefined
              }
              onInterrupt={task.isLive ? () => spawner.interrupt(task.threadId) : undefined}
              onClose={historyState.close}
            />
          ))}
        </div>
      )}

      {/* One floating window per spawned agent. The container must not disable
          pointer events: the windows own their own hit testing, and blocking it
          here also blocks dragging, closing and scrolling inside them. */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        {spawner.tasks.map((task, index) => (
          <AgentWindow
            key={task.threadId}
            id={task.threadId}
            title={task.branch ? `${task.title} · ${task.branch}` : task.title}
            status={task.isBusy ? 'working' : 'finished'}
            initialSize={AGENT_WINDOW_SIZE}
            initialPosition={cascadePosition(
              index,
              isBrowserOpen ? browserGeom.size.width + BROWSER_MARGIN : 0,
            )}
            modelId={task.model}
            streamBlocks={task.blocks}
            isFocused={activeThreadId === task.threadId}
            onFocus={() => setActiveThreadId(task.threadId)}
            onSendMessage={(text) => spawner.send(task.threadId, text)}
            onInterrupt={() => spawner.interrupt(task.threadId)}
            onClose={() => spawner.close(task.threadId)}
          />
        ))}
      </div>

      {/* The docked browser. Rendered outside the agent-window layer so its own
          focus z-index is not capped by that container's stacking context. */}
      {isBrowserOpen && (
        <div className="absolute inset-0 z-30 pointer-events-none">
          <BrowserWindow
            browser={browser}
            initialPosition={browserGeom.position}
            initialSize={browserGeom.size}
            isFocused={activeThreadId === '__browser__'}
            onFocus={() => setActiveThreadId('__browser__')}
            onClose={() => setBrowserOpen(false)}
          />
        </div>
      )}

      {/* Background Canvas Layer */}
      <div className="absolute inset-0 pointer-events-none z-10">
        {children}
      </div>
    </div>
  );
};

export default Scene;
