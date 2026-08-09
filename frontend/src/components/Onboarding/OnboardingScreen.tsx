import React, { useEffect } from 'react';
import { Header } from './Header';
import { ProviderCard } from './ProviderCard';
import { DetectedSection } from './DetectedSection';
import { PROVIDERS } from '../../constants/providers';
import { useAuthStore } from '../../store/useAuthStore';
import { ProviderID, DetectedAgent } from '../../types/auth';
import { GetDetectedAgents, GetLinkedProviders, InitiateOAuth, LinkDetectedAgent } from '../../../wailsjs/go/main/App';

const checkWailsAvailable = (): boolean => {
  const customWindow = window as any;
  return Boolean(customWindow && customWindow.go && customWindow.go.main && customWindow.go.main.App);
};

export const OnboardingScreen: React.FC = () => {
  const {
    linkedProviders,
    detectedAgents,
    activeAuthenticatingProvider,
    setDetectedAgents,
    setLinkedProviders,
    setAuthenticating,
    markProviderLinked,
  } = useAuthStore();

  useEffect(() => {
    const initializeScan = async () => {
      if (checkWailsAvailable()) {
        try {
          const agentsList: DetectedAgent[] = await GetDetectedAgents();
          if (Array.isArray(agentsList)) {
            setDetectedAgents(agentsList);
          }
        } catch (error) {
          console.error('Error scanning detected agents:', error);
        }

        try {
          const linkedList: ProviderID[] = await GetLinkedProviders();
          if (Array.isArray(linkedList)) {
            setLinkedProviders(linkedList);
          }
        } catch (error) {
          console.error('Error fetching linked providers:', error);
        }
      } else {
        setDetectedAgents([
          {
            id: 'detected-claude-cli',
            providerId: 'claude',
            name: 'Claude Code CLI',
            sourcePath: '~/.claude.json',
            isAvailable: true,
            description: 'Local Anthropic CLI session detected',
          },
          {
            id: 'detected-cursor',
            providerId: 'cursor',
            name: 'Cursor Agent',
            sourcePath: '~/.cursor',
            isAvailable: true,
            description: 'Local Cursor workspace profile',
          },
        ]);
      }
    };

    initializeScan();
  }, [setDetectedAgents, setLinkedProviders]);

  const handleConnectOAuth = async (providerId: ProviderID) => {
    setAuthenticating(providerId);

    if (checkWailsAvailable()) {
      try {
        await InitiateOAuth(providerId);
        markProviderLinked(providerId);
      } catch (error) {
        console.error(`OAuth error for ${providerId}:`, error);
      } finally {
        setAuthenticating(null);
      }
    } else {
      setTimeout(() => {
        markProviderLinked(providerId);
        setAuthenticating(null);
      }, 1200);
    }
  };

  const handleLinkAgent = async (detectedAgent: DetectedAgent) => {
    if (checkWailsAvailable()) {
      try {
        await LinkDetectedAgent(detectedAgent.id, detectedAgent.providerId);
        markProviderLinked(detectedAgent.providerId);
      } catch (error) {
        console.error('Error linking agent:', error);
      }
    } else {
      markProviderLinked(detectedAgent.providerId);
    }
  };

  return (
    <div className="h-full w-full bg-[#101010] text-white flex flex-col justify-between p-12 overflow-y-auto">
      <Header />

      <div className="flex-1 flex flex-col items-center justify-center -mt-6">
        <div className="flex items-center gap-8">
          <ProviderCard
            provider={PROVIDERS.chatgpt}
            isLinked={linkedProviders.includes('chatgpt')}
            isAuthenticating={activeAuthenticatingProvider === 'chatgpt'}
            onConnect={handleConnectOAuth}
          />

          <span className="text-neutral-500 font-medium text-sm select-none">
            Or
          </span>

          <ProviderCard
            provider={PROVIDERS.claude}
            isLinked={linkedProviders.includes('claude')}
            isAuthenticating={activeAuthenticatingProvider === 'claude'}
            onConnect={handleConnectOAuth}
          />
        </div>
      </div>

      <DetectedSection
        agents={detectedAgents}
        linkedProviders={linkedProviders}
        onLinkAgent={handleLinkAgent}
      />
    </div>
  );
};
