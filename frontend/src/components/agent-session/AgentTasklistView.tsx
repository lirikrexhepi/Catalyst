import React, { useState, useMemo } from 'react';
import { TodoItem } from './TodoTool';
import { MutateAgentTask } from '../../../wailsjs/go/main/App';

export interface AgentTasklistViewProps {
  threadId?: string;
  todos?: TodoItem[];
  isWorking?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onToggleTodo?: (idOrIndex: string) => void;
  onAddTodo?: (text: string) => void;
  onStatusChange?: (idOrIndex: string, status: 'pending' | 'in_progress' | 'completed') => void;
}

type FilterTab = 'all' | 'active' | 'completed';

export const AgentTasklistView: React.FC<AgentTasklistViewProps> = ({
  threadId,
  todos = [],
  isWorking = false,
  className = '',
  style,
  onToggleTodo,
  onAddTodo,
  onStatusChange,
}) => {
  const [filter, setFilter] = useState<FilterTab>('all');
  const [newTaskText, setNewTaskText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const completedCount = todos.filter((t) => t.status === 'completed').length;
  const inProgressCount = todos.filter((t) => t.status === 'in_progress').length;
  const totalCount = todos.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const filteredTodos = useMemo(() => {
    if (filter === 'active') {
      return todos.filter((t) => t.status !== 'completed');
    }
    if (filter === 'completed') {
      return todos.filter((t) => t.status === 'completed');
    }
    return todos;
  }, [todos, filter]);

  const handleToggle = async (todo: TodoItem, index: number) => {
    if (onToggleTodo) {
      onToggleTodo(todo.id);
      return;
    }
    if (threadId) {
      try {
        await MutateAgentTask(threadId, 'toggle', String(index + 1), '');
      } catch (err) {
        console.error('Failed to toggle task:', err);
      }
    }
  };

  const handleSetStatus = async (
    todo: TodoItem,
    index: number,
    status: 'pending' | 'in_progress' | 'completed',
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    if (onStatusChange) {
      onStatusChange(todo.id, status);
      return;
    }
    if (threadId) {
      try {
        const action = status === 'completed' ? 'done' : status === 'in_progress' ? 'start' : 'toggle';
        await MutateAgentTask(threadId, action, String(index + 1), '');
      } catch (err) {
        console.error('Failed to update task status:', err);
      }
    }
  };

  const handleDelete = async (todo: TodoItem, index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (threadId) {
      try {
        await MutateAgentTask(threadId, 'remove', String(index + 1), '');
      } catch (err) {
        console.error('Failed to remove task:', err);
      }
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = newTaskText.trim();
    if (!text || isSubmitting) return;

    setIsSubmitting(true);
    try {
      if (onAddTodo) {
        onAddTodo(text);
      } else if (threadId) {
        await MutateAgentTask(threadId, 'add', '', text);
      }
      setNewTaskText('');
    } catch (err) {
      console.error('Failed to add task:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={`flex flex-col h-full w-full select-none font-['Geist'] text-white ${className}`}
      style={style}
    >
      {/* Header with Progress & Filter Tabs */}
      <div className="shrink-0 px-3 pt-2 pb-3 border-b border-white/[0.08] flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[17px] text-white/70 leading-none">
              checklist
            </span>
            <span className="text-[13px] font-semibold text-white tracking-tight">
              Tasklist
            </span>
            {totalCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-white/[0.08] border border-white/[0.08] text-white/80">
                {completedCount}/{totalCount}
              </span>
            )}
          </div>

          {/* Quick Filter Pill Switcher */}
          {totalCount > 0 && (
            <div className="flex items-center p-0.5 rounded-full bg-white/[0.06] border border-white/[0.06] text-[10px]">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`px-2 py-0.5 rounded-full transition-all cursor-pointer ${
                  filter === 'all'
                    ? 'bg-white/20 text-white font-medium shadow-sm'
                    : 'text-white/45 hover:text-white/80'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilter('active')}
                className={`px-2 py-0.5 rounded-full transition-all cursor-pointer ${
                  filter === 'active'
                    ? 'bg-white/20 text-white font-medium shadow-sm'
                    : 'text-white/45 hover:text-white/80'
                }`}
              >
                Active ({totalCount - completedCount})
              </button>
              <button
                type="button"
                onClick={() => setFilter('completed')}
                className={`px-2 py-0.5 rounded-full transition-all cursor-pointer ${
                  filter === 'completed'
                    ? 'bg-white/20 text-white font-medium shadow-sm'
                    : 'text-white/45 hover:text-white/80'
                }`}
              >
                Done ({completedCount})
              </button>
            </div>
          )}
        </div>

        {/* Liquid Progress Bar */}
        {totalCount > 0 && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[11px] text-white/50 font-medium">
              <span>
                {completedCount === totalCount
                  ? 'All tasks completed'
                  : inProgressCount > 0
                  ? `${inProgressCount} in progress`
                  : `${totalCount - completedCount} remaining`}
              </span>
              <span className="font-mono text-white/70">{progressPercent}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden p-0.5 relative shadow-inner">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300 ease-out shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Task List Items Body */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-1.5">
        {filteredTodos.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-white/40">
            <div className="w-10 h-10 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-3 text-white/35 shadow-inner">
              <span className="material-symbols-outlined text-[20px]">
                {filter === 'completed' ? 'done_all' : 'fact_check'}
              </span>
            </div>
            <p className="text-[13px] font-medium text-white/70">
              {totalCount === 0
                ? 'No tasks in this list yet'
                : filter === 'completed'
                ? 'No completed tasks yet'
                : 'All tasks completed!'}
            </p>
            <p className="text-[11px] text-white/40 mt-1 max-w-[280px]">
              {totalCount === 0
                ? 'When this agent is given 3 or more code changes, it will break them down here automatically. You can also add tasks manually below.'
                : ''}
            </p>
          </div>
        ) : (
          filteredTodos.map((todo, idx) => {
            const originalIndex = todos.findIndex((t) => t.id === todo.id);
            const isDone = todo.status === 'completed';
            const isInProgress = todo.status === 'in_progress';

            return (
              <div
                key={todo.id}
                onClick={() => handleToggle(todo, originalIndex >= 0 ? originalIndex : idx)}
                className={`group flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border transition-all duration-150 cursor-pointer ${
                  isDone
                    ? 'bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.05]'
                    : isInProgress
                    ? 'bg-sky-500/[0.08] border-sky-400/25 shadow-[0_2px_12px_rgba(56,189,248,0.12)] hover:border-sky-400/40'
                    : 'bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.07] hover:border-white/20'
                }`}
              >
                {/* Status Indicator Icon */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggle(todo, originalIndex >= 0 ? originalIndex : idx);
                    }}
                    className="shrink-0 flex items-center justify-center focus:outline-none cursor-pointer"
                  >
                    {isDone ? (
                      <span className="material-symbols-outlined text-[18px] text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.6)] leading-none">
                        check_circle
                      </span>
                    ) : isInProgress ? (
                      <span className="material-symbols-outlined text-[18px] text-sky-400 leading-none animate-pulse drop-shadow-[0_0_6px_rgba(56,189,248,0.7)]">
                        arrow_circle_right
                      </span>
                    ) : (
                      <span className="material-symbols-outlined text-[18px] text-white/30 group-hover:text-white/60 leading-none transition-colors">
                        radio_button_unchecked
                      </span>
                    )}
                  </button>

                  {/* Task Content */}
                  <span
                    className={`text-[12.5px] leading-snug tracking-tight truncate select-text ${
                      isDone
                        ? 'line-through text-white/35 font-normal'
                        : isInProgress
                        ? 'text-white font-medium'
                        : 'text-white/85 font-normal'
                    }`}
                  >
                    {todo.text}
                  </span>
                </div>

                {/* Right Action Buttons on Hover */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {!isDone && !isInProgress && (
                    <button
                      type="button"
                      title="Mark In Progress"
                      onClick={(e) =>
                        handleSetStatus(
                          todo,
                          originalIndex >= 0 ? originalIndex : idx,
                          'in_progress',
                          e,
                        )
                      }
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium text-sky-300 hover:bg-sky-500/20 transition-colors"
                    >
                      Start
                    </button>
                  )}
                  {!isDone && (
                    <button
                      type="button"
                      title="Mark Completed"
                      onClick={(e) =>
                        handleSetStatus(
                          todo,
                          originalIndex >= 0 ? originalIndex : idx,
                          'completed',
                          e,
                        )
                      }
                      className="px-1.5 py-0.5 rounded text-[10px] font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                    >
                      Done
                    </button>
                  )}
                  <button
                    type="button"
                    title="Remove Task"
                    onClick={(e) =>
                      handleDelete(todo, originalIndex >= 0 ? originalIndex : idx, e)
                    }
                    className="p-1 rounded text-white/30 hover:text-rose-400 hover:bg-rose-500/15 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px] leading-none">
                      close
                    </span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Quick Add Task Input at Bottom */}
      <div className="shrink-0 p-3 pt-2 border-t border-white/[0.08] bg-black/10 backdrop-blur-sm">
        <form onSubmit={handleAddTask} className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[15px] text-white/35 pointer-events-none">
              add
            </span>
            <input
              type="text"
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              placeholder="Add task to this agent... (Enter to save)"
              className="w-full pl-8 pr-3 py-1.5 text-[12px] rounded-lg bg-white/[0.06] hover:bg-white/[0.09] focus:bg-white/[0.12] border border-white/[0.08] focus:border-white/25 text-white placeholder:text-white/35 focus:outline-none transition-all"
            />
          </div>
          {newTaskText.trim() && (
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-white/[0.15] hover:bg-white/25 active:scale-95 text-white border border-white/15 transition-all cursor-pointer shadow-sm shrink-0"
            >
              Add
            </button>
          )}
        </form>
      </div>
    </div>
  );
};

export default AgentTasklistView;