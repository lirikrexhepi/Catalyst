import { CLIProvider, AIModel } from './types';
import claudeLogo from '../../assets/logo/claude-icon-logo.png';
import antigravityLogo from '../../assets/logo/antigravity-icon-logo.png';

export const DEFAULT_PROVIDERS: CLIProvider[] = [
  {
    id: 'anthropic',
    name: 'Claude / Anthropic',
    icon: claudeLogo,
    description: 'Anthropic Claude CLI Provider',
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    icon: antigravityLogo,
    description: 'Antigravity Multi-Agent Orchestrator',
  },
];

export const DEFAULT_MODELS: AIModel[] = [
  // Anthropic / Claude Models
  {
    id: 'claude-haiku',
    name: 'Claude Haiku',
    providerId: 'anthropic',
    icon: claudeLogo,
    supportsThinking: true,
    effortLevels: ['Low', 'Medium', 'High', 'Ultra'],
    defaultEffort: 'Low',
    defaultMode: 'normal',
  },
  {
    id: 'claude-sonnet-5',
    name: 'Claude Sonnet 5',
    providerId: 'anthropic',
    icon: claudeLogo,
    supportsThinking: true,
    effortLevels: ['Low', 'Medium', 'High', 'Ultra'],
    defaultEffort: 'Medium',
    defaultMode: 'thinking',
  },
  {
    id: 'claude-opus-5',
    name: 'Claude Opus 5',
    providerId: 'anthropic',
    icon: claudeLogo,
    supportsThinking: true,
    effortLevels: ['Low', 'Medium', 'High', 'Ultra'],
    defaultEffort: 'High',
    defaultMode: 'thinking',
  },
  {
    id: 'claude-fable-5',
    name: 'Claude Fable 5',
    providerId: 'anthropic',
    icon: claudeLogo,
    supportsThinking: false, // Model without thinking mode (demonstrating dynamic conditional rendering)
    effortLevels: ['Low', 'Medium', 'High', 'Ultra'],
    defaultEffort: 'High',
    defaultMode: 'normal',
  },

  // Antigravity Models
  {
    id: 'agy-pro',
    name: 'Antigravity Pro',
    providerId: 'antigravity',
    icon: antigravityLogo,
    supportsThinking: true,
    effortLevels: ['Low', 'Medium', 'High', 'Ultra'],
    defaultEffort: 'Ultra',
    defaultMode: 'thinking',
  },
  {
    id: 'agy-flash',
    name: 'Antigravity Flash',
    providerId: 'antigravity',
    icon: antigravityLogo,
    supportsThinking: true,
    effortLevels: ['Low', 'Medium', 'High'],
    defaultEffort: 'Medium',
    defaultMode: 'normal',
  },
  {
    id: 'agy-flash-lite',
    name: 'Antigravity Flash-Lite',
    providerId: 'antigravity',
    icon: antigravityLogo,
    supportsThinking: false,
    effortLevels: ['Low', 'Medium'],
    defaultEffort: 'Low',
    defaultMode: 'normal',
  },
];
