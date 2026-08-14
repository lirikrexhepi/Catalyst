import React, { useState, useCallback } from 'react';
import sceneBg from '../../assets/images/sceneBackground.jpg';
import { OrchestratorInput } from '../orchestrator';
import { AgentWindow, AgentStreamBlock } from '../agent-session';

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

const AGENT_WINDOW_INITIAL_SIZE = { width: 520, height: 660 };

export const Scene: React.FC<SceneProps> = ({ children }) => {
  const [streamBlocks, setStreamBlocks] = useState<AgentStreamBlock[]>([
    {
      type: 'user',
      id: 'msg-1',
      content: 'Task 2 instructions given by the orchestraor here',
    },
    {
      type: 'thinking',
      id: 'think-1',
      isThinking: false,
      durationSeconds: 3,
      thoughtText: 'Got that, created a new work tree for task 2. Scanning repository for relevant files.',
    },
    {
      type: 'text',
      id: 'text-1',
      content: 'Got that, created a new work tree for task 2. Scanning repository for relevant files.',
    },
    {
      type: 'tool_group',
      id: 'tg-1',
      title: 'Task completed',
      summary: '10 files, 12 searches, 20 commands',
      items: [
        { type: 'read', action: 'Read', target: 'composable/Test.tsx' },
        { type: 'bash', action: 'Ran command', target: 'npm run build' },
        { type: 'search', action: 'Searched', target: 'useTransitionMount' },
        { type: 'edit', action: 'Edited', target: 'components/AgentInput.tsx' },
      ],
    },
    {
      type: 'tool_search',
      id: 'search-1',
      files: [
        'composables/TestFiles.tsx',
        'composables/TestFiles.tsx',
        'composables/TestFiles.tsx',
      ],
    },
    {
      type: 'tool_edit',
      id: 'edit-1',
      filePath: 'page.tsx',
      additions: 9,
      deletions: 4,
    },
    {
      type: 'tool_bash',
      id: 'bash-1',
      command: 'ls -la',
      summary: 'ls',
      output: `app\nlib\nREADME.md`,
      status: 'completed',
    },
    {
      type: 'tool_todo',
      id: 'todo-1',
      todos: [
        { id: '1', text: 'Audit components', status: 'completed' },
        { id: '2', text: 'Tighten spacing', status: 'in_progress' },
        { id: '3', text: 'Ship updates', status: 'pending' },
      ],
    },
    {
      type: 'tool_plan',
      id: 'plan-1',
      planFile: 'plan-plan-1.md',
      title: 'Refresh UI previews',
      summary: 'Unify tool card spacing and interaction patterns so docs previews feel cohesive across all tool components. Also update the plan tool to support inline editing of the plan title.',
    },
    {
      type: 'tool_question',
      id: 'q-1',
      questionNumber: 1,
      totalQuestions: 2,
      question: 'How should we apply this change?',
      options: [
        { key: 'A', label: 'Small scoped patch' },
        { key: 'B', label: 'Full refactor' },
        { key: 'C', label: 'Type your answer', isCustomInput: true },
      ],
    },
    {
      type: 'thinking',
      id: 'think-2',
      isThinking: false,
      durationSeconds: 2,
      thoughtText: 'Synthesizing changes and evaluating test cases...',
    },
  ]);

  const handleSendMessage = useCallback((msg: string, modelId: string) => {
    const stamp = Date.now();
    setStreamBlocks((prev) => [
      ...prev,
      {
        type: 'user',
        id: `user-${stamp}`,
        content: msg,
      },
      {
        type: 'thinking',
        id: `think-${stamp}`,
        isThinking: true,
        durationSeconds: 0,
        thoughtText: `Thinking with ${modelId}...`,
      },
    ]);
  }, []);

  const handleInterrupt = useCallback(() => {
    setStreamBlocks((prev) =>
      prev.map((b) =>
        b.type === 'thinking' && b.isThinking ? { ...b, isThinking: false } : b
      )
    );
  }, []);

  const handleApprovePlan = useCallback((blockId: string) => {
    setStreamBlocks((prev) =>
      prev.map((b) => (b.id === blockId && b.type === 'tool_plan' ? { ...b, approved: true } : b))
    );
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none bg-black flex flex-col items-center">
      {/* The backdrop every glass surface samples. Kept on its own static compositor
          layer so window drags and feed scrolls never repaint the photo itself. */}
      <div className="absolute inset-0 z-0 pointer-events-none" style={SCENE_BG_STYLE} />
      {/* Top Orchestrator Input Bar */}
      <div className="absolute top-6 z-40 flex justify-center w-full px-4 pointer-events-auto">
        <OrchestratorInput />
      </div>

      {/* Desktop Canvas with Floating Draggable/Resizable Agent Window */}
      <div className="absolute inset-0 pointer-events-none z-20">
        <AgentWindow
          title="Task 2 name here"
          initialSize={AGENT_WINDOW_INITIAL_SIZE}
          streamBlocks={streamBlocks}
          onSendMessage={handleSendMessage}
          onInterrupt={handleInterrupt}
          onApprovePlan={handleApprovePlan}
        />
      </div>

      {/* Background Canvas Layer */}
      <div className="absolute inset-0 pointer-events-none z-10">
        {children}
      </div>
    </div>
  );
};

export default Scene;
