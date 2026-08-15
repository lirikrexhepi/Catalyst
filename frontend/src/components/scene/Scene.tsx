import React, { useCallback, useEffect, useRef, useState } from 'react';
import sceneBg from '../../assets/images/sceneBackground.jpg';
import {
  OrchestratorInput,
  CoordinatorPanel,
  PlanPrompt,
  useCoordinator,
  useSpawner,
} from '../orchestrator';
import { AgentWindow } from '../agent-session';

export interface SceneProps {
  children?: React.ReactNode;
}

const SCENE_BG_STYLE: React.CSSProperties = {
  backgroundImage: `url(${sceneBg})`,
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
function cascadePosition(index: number) {
  const gap = 18;
  const top = 150;
  const columnWidth = AGENT_WINDOW_SIZE.width + gap;

  const available = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const perRow = Math.max(1, Math.floor((available - gap) / columnWidth));
  const row = Math.floor(index / perRow);
  const column = index % perRow;

  return {
    x: gap + column * columnWidth + row * 32,
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
      <div className="absolute inset-0 z-0 pointer-events-none" style={SCENE_BG_STYLE} />

      {/* Coordinator: input bar, its transcript, and any pending delegation.
          Outer container is pointer-events-none so clicks on empty space pass straight
          through to agent windows behind and beside it. */}
      <div className="absolute top-6 z-40 flex flex-col items-center gap-2.5 w-full px-4 pointer-events-none">
        <div className="pointer-events-auto">
          <OrchestratorInput
            onSubmit={coordinator.send}
            onInterrupt={coordinator.interrupt}
            isBusy={coordinator.isBusy}
          />
        </div>
        <div className="pointer-events-auto">
          <CoordinatorPanel
            blocks={coordinator.blocks}
            isBusy={coordinator.isBusy}
            error={coordinator.error ?? spawner.error}
            isCollapsed={isPanelCollapsed}
            onToggleCollapsed={togglePanel}
          />
        </div>
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
            initialPosition={cascadePosition(index)}
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

      {/* Background Canvas Layer */}
      <div className="absolute inset-0 pointer-events-none z-10">
        {children}
      </div>
    </div>
  );
};

export default Scene;
