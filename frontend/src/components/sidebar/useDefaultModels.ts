import { useCallback, useEffect, useState } from 'react';
import { GetProviderSettings, UpdateProviderSettings } from '../../../wailsjs/go/main/App';
import { domain } from '../../../wailsjs/go/models';
import { useOrchestratorStore } from '../orchestrator/useOrchestratorStore';
import { AIModel, CLIProvider } from '../orchestrator/types';

export interface ProviderDefault {
  provider: CLIProvider;
  models: AIModel[];
  /** Empty means the CLI's own default is used rather than a pinned choice. */
  modelId: string;
}

export interface DefaultModels {
  entries: ProviderDefault[];
  error: string | null;
  isSaving: string | null;
  select: (providerId: string, modelId: string) => Promise<void>;
}

/**
 * Per-CLI preferred model.
 *
 * Stored against the provider rather than in the UI store because it must
 * outlive the window: the point of a default is that the next run starts with
 * it already chosen.
 */
export function useDefaultModels(isOpen: boolean): DefaultModels {
  const providers = useOrchestratorStore((state) => state.providers);
  const models = useOrchestratorStore((state) => state.models);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || providers.length === 0) return;
    let active = true;

    void (async () => {
      try {
        const pairs = await Promise.all(
          providers.map(async (provider) => {
            const settings = await GetProviderSettings(provider.id);
            return [provider.id, settings.model ?? ''] as const;
          }),
        );
        if (!active) return;
        setSaved(Object.fromEntries(pairs));
        setError(null);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      }
    })();

    return () => {
      active = false;
    };
  }, [isOpen, providers]);

  const select = useCallback(
    async (providerId: string, modelId: string) => {
      setSaving(providerId);
      try {
        // Read-modify-write: the settings record also holds the binary path and
        // environment, and writing only the model would erase them.
        const current = await GetProviderSettings(providerId);
        await UpdateProviderSettings(
          providerId,
          domain.ProviderSettings.createFrom({ ...current, model: modelId }),
        );
        setSaved((previous) => ({ ...previous, [providerId]: modelId }));

        // Applied immediately as well as saved, so the bar reflects the choice
        // without waiting for a restart.
        if (modelId) {
          const store = useOrchestratorStore.getState();
          if (store.selectedProviderId === providerId) store.selectModelSilently(modelId);
        }
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setSaving(null);
      }
    },
    [],
  );

  const entries: ProviderDefault[] = providers.map((provider) => ({
    provider,
    models: models.filter((model) => model.providerId === provider.id),
    modelId: saved[provider.id] ?? '',
  }));

  return { entries, error, isSaving, select };
}
