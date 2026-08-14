import { create } from 'zustand';
import { AIModel, CLIProvider, ModelSettings, ThinkingEffort, ThinkingMode } from './types';
import { DEFAULT_MODELS, DEFAULT_PROVIDERS } from './orchestratorData';

interface OrchestratorStore {
  providers: CLIProvider[];
  models: AIModel[];
  selectedProviderId: string;
  selectedModelId: string;
  modelSettings: Record<string, ModelSettings>;
  messageText: string;
  isModelPickerOpen: boolean;
  isEffortPickerOpen: boolean;
  activeConfiguringModelId: string | null;

  // Actions
  setProviders: (providers: CLIProvider[]) => void;
  setModels: (models: AIModel[]) => void;
  addProvider: (provider: CLIProvider) => void;
  addModel: (model: AIModel) => void;
  selectProvider: (providerId: string) => void;
  selectModel: (modelId: string) => void;
  setModelSettings: (modelId: string, settings: Partial<ModelSettings>) => void;
  setMessageText: (text: string) => void;
  setModelPickerOpen: (open: boolean) => void;
  setEffortPickerOpen: (open: boolean) => void;
  toggleModelPicker: () => void;
  closeAllPickers: () => void;
  openEffortForModel: (modelId: string) => void;

  // Selectors / Helpers
  getSelectedModel: () => AIModel | undefined;
  getSelectedProvider: () => CLIProvider | undefined;
  getConfiguringModel: () => AIModel | undefined;
  getModelsForProvider: (providerId: string) => AIModel[];
  getCurrentModelSettings: (modelId?: string) => ModelSettings;
}

const initialSettings: Record<string, ModelSettings> = {};
DEFAULT_MODELS.forEach((m) => {
  initialSettings[m.id] = {
    effort: m.defaultEffort || 'Medium',
    mode: m.defaultMode || (m.supportsThinking ? 'thinking' : 'normal'),
  };
});

export const useOrchestratorStore = create<OrchestratorStore>((set, get) => ({
  providers: DEFAULT_PROVIDERS,
  models: DEFAULT_MODELS,
  selectedProviderId: 'anthropic',
  selectedModelId: 'claude-opus-5',
  modelSettings: initialSettings,
  messageText: '',
  isModelPickerOpen: false,
  isEffortPickerOpen: false,
  activeConfiguringModelId: null,

  setProviders: (providers) => set({ providers }),
  setModels: (models) => set({ models }),

  addProvider: (provider) =>
    set((state) => ({
      providers: [...state.providers.filter((p) => p.id !== provider.id), provider],
    })),

  addModel: (model) =>
    set((state) => {
      const exists = state.models.some((m) => m.id === model.id);
      return {
        models: exists ? state.models.map((m) => (m.id === model.id ? model : m)) : [...state.models, model],
        modelSettings: {
          ...state.modelSettings,
          [model.id]: state.modelSettings[model.id] || {
            effort: model.defaultEffort || 'Medium',
            mode: model.defaultMode || (model.supportsThinking ? 'thinking' : 'normal'),
          },
        },
      };
    }),

  selectProvider: (providerId) => {
    const providerModels = get().models.filter((m) => m.providerId === providerId);
    const newSelectedModelId = providerModels[0]?.id || get().selectedModelId;
    set({
      selectedProviderId: providerId,
      selectedModelId: newSelectedModelId,
      activeConfiguringModelId: newSelectedModelId,
    });
  },

  selectModel: (modelId) => {
    const model = get().models.find((m) => m.id === modelId);
    if (!model) return;
    const { selectedModelId, isEffortPickerOpen } = get();

    // Toggle effort modal: if clicking the active model and effort modal is open, close it
    if (selectedModelId === modelId && isEffortPickerOpen) {
      set({ isEffortPickerOpen: false });
    } else {
      set({
        selectedModelId: modelId,
        selectedProviderId: model.providerId,
        activeConfiguringModelId: modelId,
        isEffortPickerOpen: true,
      });
    }
  },

  openEffortForModel: (modelId) => {
    set({
      activeConfiguringModelId: modelId,
      isEffortPickerOpen: true,
    });
  },

  setModelSettings: (modelId, newSettings) => {
    set((state) => ({
      modelSettings: {
        ...state.modelSettings,
        [modelId]: {
          ...(state.modelSettings[modelId] || { effort: 'Medium', mode: 'normal' }),
          ...newSettings,
        },
      },
    }));
  },

  setMessageText: (messageText) => set({ messageText }),

  setModelPickerOpen: (isModelPickerOpen) =>
    set((state) => ({
      isModelPickerOpen,
      isEffortPickerOpen: isModelPickerOpen ? state.isEffortPickerOpen : false,
    })),

  setEffortPickerOpen: (isEffortPickerOpen) => set({ isEffortPickerOpen }),

  toggleModelPicker: () =>
    set((state) => {
      const nextOpen = !state.isModelPickerOpen;
      return {
        isModelPickerOpen: nextOpen,
        isEffortPickerOpen: nextOpen ? false : false,
        activeConfiguringModelId: nextOpen ? state.selectedModelId : null,
      };
    }),

  closeAllPickers: () =>
    set({
      isModelPickerOpen: false,
      isEffortPickerOpen: false,
    }),

  getSelectedModel: () => {
    const { models, selectedModelId } = get();
    return models.find((m) => m.id === selectedModelId) || models[0];
  },

  getSelectedProvider: () => {
    const { providers, selectedProviderId } = get();
    return providers.find((p) => p.id === selectedProviderId) || providers[0];
  },

  getConfiguringModel: () => {
    const { models, activeConfiguringModelId, selectedModelId } = get();
    const id = activeConfiguringModelId || selectedModelId;
    return models.find((m) => m.id === id) || models[0];
  },

  getModelsForProvider: (providerId) => {
    return get().models.filter((m) => m.providerId === providerId);
  },

  getCurrentModelSettings: (modelId) => {
    const id = modelId || get().selectedModelId;
    const model = get().models.find((m) => m.id === id);
    const existing = get().modelSettings[id];
    if (existing) return existing;
    return {
      effort: model?.defaultEffort || 'Medium',
      mode: model?.defaultMode || (model?.supportsThinking ? 'thinking' : 'normal'),
    };
  },
}));
