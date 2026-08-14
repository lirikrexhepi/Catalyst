import React from 'react';

export interface TodoItem {
  id: string;
  text: string;
  status: 'completed' | 'in_progress' | 'pending';
}

export interface TodoToolProps {
  todos: TodoItem[];
  title?: string;
  className?: string;
  onToggleTodo?: (id: string) => void;
}

/**
 * TodoTool Component
 * Task list changes and step tracker for agent execution.
 */
const TodoToolImpl: React.FC<TodoToolProps> = ({
  todos = [
    { id: '1', text: 'Audit components', status: 'completed' },
    { id: '2', text: 'Tighten spacing', status: 'in_progress' },
    { id: '3', text: 'Ship updates', status: 'pending' },
  ],
  title,
  className = '',
  onToggleTodo,
}) => {
  return (
    <div
      className={`rounded-[14px] glass-card border border-white/25 p-3 text-white max-w-full shadow-md font-['Geist'] select-none flex flex-col gap-2 ${className}`}
      style={{
        boxShadow:
          '0 4px 16px rgba(0, 0, 0, 0.2), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.35)',
      }}
    >
      {title && (
        <div className="text-[12px] font-medium text-white tracking-tight pb-1 border-b border-white/10">
          {title}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {todos.map((todo) => {
          const isDone = todo.status === 'completed';
          const isInProgress = todo.status === 'in_progress';

          return (
            <div
              key={todo.id}
              onClick={() => onToggleTodo?.(todo.id)}
              className="flex items-center gap-2.5 px-1 py-0.5 rounded-[6px] hover:bg-white/10 active:scale-[0.99] transition-all cursor-pointer group"
            >
              {/* Status Icon */}
              {isDone ? (
                <span className="material-symbols-outlined text-[16px] text-emerald-400 shrink-0 leading-none">
                  check_circle
                </span>
              ) : isInProgress ? (
                <span className="material-symbols-outlined text-[16px] text-blue-400 shrink-0 leading-none animate-pulse">
                  arrow_circle_right
                </span>
              ) : (
                <span className="material-symbols-outlined text-[16px] text-white/40 group-hover:text-white/70 shrink-0 leading-none">
                  radio_button_unchecked
                </span>
              )}

              {/* Task text */}
              <span
                className={`text-[12px] tracking-tight leading-none ${
                  isDone
                    ? 'line-through text-white/45'
                    : isInProgress
                    ? 'text-white font-medium'
                    : 'text-white/75'
                }`}
              >
                {todo.text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const TodoTool = React.memo(TodoToolImpl);
TodoTool.displayName = 'TodoTool';

export default TodoTool;
