import React from 'react';
import { DetectedAgent, ProviderID } from '../../types/auth';
import { DetectedAgentCard } from './DetectedAgentCard';

interface DetectedSectionProps {
  agents: DetectedAgent[];
  linkedProviders: ProviderID[];
  onLinkAgent: (agent: DetectedAgent) => void;
}

export const DetectedSection: React.FC<DetectedSectionProps> = ({
  agents,
  linkedProviders,
  onLinkAgent,
}) => {
  if (agents.length === 0) return null;

  return (
    <div className="mt-20 flex flex-col items-center select-none animate-fade-in">
      <p className="text-center text-sm font-normal text-neutral-400 max-w-lg mb-6 leading-relaxed">
        The following agents have been detected on your system as already setup,
        <br />
        do you want them to get linked to Catalyst?
      </p>

      <div className="flex flex-wrap items-center justify-center gap-4 max-w-3xl">
        {agents.map((agent) => (
          <DetectedAgentCard
            key={agent.id}
            agent={agent}
            isLinked={linkedProviders.includes(agent.providerId)}
            onLink={onLinkAgent}
          />
        ))}
      </div>
    </div>
  );
};
