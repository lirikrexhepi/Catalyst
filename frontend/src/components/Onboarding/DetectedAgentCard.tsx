import React from 'react';
import { DetectedAgent } from '../../types/auth';

interface DetectedAgentCardProps {
  agent: DetectedAgent;
  isLinked: boolean;
  onLink: (agent: DetectedAgent) => void;
}

export const DetectedAgentCard: React.FC<DetectedAgentCardProps> = ({
  agent,
  isLinked,
  onLink,
}) => {
  return (
    <div
      className={`
        flex items-center justify-between px-5 py-4 rounded-xl border
        transition-all duration-200 bg-[#161616] min-w-[220px] max-w-[260px]
        ${
          isLinked
            ? 'border-emerald-500/50 bg-[#1c1c1c]'
            : 'border-neutral-800 hover:border-neutral-700 hover:bg-[#1f1f1f]'
        }
      `}
    >
      <div className="flex flex-col min-w-0 pr-3">
        <span className="text-sm font-semibold text-white truncate">
          {agent.name}
        </span>
        <span className="text-xs text-neutral-500 truncate mt-0.5" title={agent.sourcePath}>
          {agent.sourcePath}
        </span>
      </div>

      <button
        type="button"
        onClick={() => !isLinked && onLink(agent)}
        disabled={isLinked}
        className={`
          shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-all outline-none cursor-pointer
          ${
            isLinked
              ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/40 cursor-default'
              : 'bg-neutral-800 text-neutral-200 hover:bg-white hover:text-black active:scale-95'
          }
        `}
      >
        {isLinked ? 'Linked' : 'Link'}
      </button>
    </div>
  );
};
