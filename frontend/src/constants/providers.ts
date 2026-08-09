import { ProviderMeta, ProviderID } from '../types/auth';

export const PROVIDERS: Record<ProviderID, ProviderMeta> = {
  chatgpt: {
    id: 'chatgpt',
    name: 'ChatGPT',
    subtitle: 'OpenAI GPT-4o & Codex',
    accentColor: '#10a37f',
    isOAuthAvailable: true,
  },
  claude: {
    id: 'claude',
    name: 'Claude',
    subtitle: 'Anthropic Claude 3.5 Sonnet',
    accentColor: '#d97757',
    isOAuthAvailable: true,
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    subtitle: 'Google Gemini Pro 1.5',
    accentColor: '#4285f4',
    isOAuthAvailable: false,
    isFutureProvider: true,
  },
  cursor: {
    id: 'cursor',
    name: 'Cursor',
    subtitle: 'Cursor Agent Harness',
    accentColor: '#8a2be2',
    isOAuthAvailable: false,
    isFutureProvider: true,
  },
  opencode: {
    id: 'opencode',
    name: 'OpenCode',
    subtitle: 'OpenCode Agent CLI',
    accentColor: '#38bdf8',
    isOAuthAvailable: false,
    isFutureProvider: true,
  },
  kimi: {
    id: 'kimi',
    name: 'Kimi',
    subtitle: 'Moonshot Kimi AI',
    accentColor: '#ff551d',
    isOAuthAvailable: false,
    isFutureProvider: true,
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    subtitle: 'Local Open Models',
    accentColor: '#ffffff',
    isOAuthAvailable: false,
    isFutureProvider: true,
  },
};

export const ACTIVE_OAUTH_PROVIDERS: ProviderID[] = ['chatgpt', 'claude'];
