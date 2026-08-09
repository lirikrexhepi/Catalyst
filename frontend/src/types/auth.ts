export type ProviderID = 'chatgpt' | 'claude' | 'gemini' | 'cursor' | 'opencode' | 'kimi' | 'ollama' | string;

export interface ProviderMeta {
  id: ProviderID;
  name: string;
  subtitle: string;
  accentColor: string;
  isOAuthAvailable: boolean;
  isFutureProvider?: boolean;
}

export interface DetectedAgent {
  id: string;
  providerId: ProviderID;
  name: string;
  sourcePath: string;
  isAvailable: boolean;
  description: string;
}

export interface Credential {
  providerId: ProviderID;
  accessToken?: string;
  sessionKey?: string;
  isLinked: boolean;
}
