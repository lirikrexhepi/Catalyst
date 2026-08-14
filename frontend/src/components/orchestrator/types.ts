export type ThinkingEffort = 'Low' | 'Medium' | 'High' | 'Ultra' | string;
export type ThinkingMode = 'normal' | 'thinking';

export interface AIModel {
  id: string;
  name: string;
  providerId: string;
  icon?: string;
  supportsThinking?: boolean;
  effortLevels?: ThinkingEffort[];
  defaultEffort?: ThinkingEffort;
  defaultMode?: ThinkingMode;
  description?: string;
}

export interface CLIProvider {
  id: string;
  name: string;
  icon: string;
  description?: string;
}

export interface ModelSettings {
  effort: ThinkingEffort;
  mode: ThinkingMode;
}

export interface OrchestratorState {
  providers: CLIProvider[];
  models: AIModel[];
  selectedProviderId: string;
  selectedModelId: string;
  modelSettings: Record<string, ModelSettings>;
  messageText: string;
  isModelPickerOpen: boolean;
  isEffortPickerOpen: boolean;
  activeHoveredModelId: string | null;
}
