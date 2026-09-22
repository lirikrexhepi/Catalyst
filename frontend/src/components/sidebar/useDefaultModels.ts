import { useCallback, useEffect, useState } from 'react';
import { GetProviderSettings, ListProviders, UpdateProviderSettings } from '../../../wailsjs/go/main/App';
import { domain } from '../../../wailsjs/go/models';
import { useOrchestratorStore } from '../orchestrator/useOrchestratorStore';
import { AIModel, CLIProvider } from '../orchestrator/types';
import { toModel, toProvider } from '../orchestrator/orchestratorData';

export interface ProviderDefault {
  provider: CLIProvider;
  models: AIModel[];
  /** Empty means the CLI's own default is used rather than a pinned choice. */
  modelId: string;
  enabled: boolean;
}

export interface DefaultModels {
  entries: ProviderDefault[];
  error: string | null;
  isSaving: string | null;
  select: (providerId: string, modelId: string) => Promise<void>;
  toggle: (providerId: string, enabled: boolean) => Promise<void>;
}

/**
 * Per-CLI preferred model & permission toggle.
 *
 * Stored against the provider in backend settings so choices survive restart.
 */
export function useDefaultModels(isOpen: boolean): DefaultModels {
  const [entries, setEntries] = useState<ProviderDefault[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setSaving] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const snapshots = await ListProviders(false);
      const ready = snapshots.filter((s) => s.availability === 'ready');

      const items: ProviderDefault[] = await Promise.all(
        ready.map(async (snapshot) => {
          const provider = toProvider(snapshot);
          const models = (snapshot.models ?? []).map((m) => toModel(snapshot, m));
          const settings = await GetProviderSettings(provider.id);

          return {
            provider,
            models,
            modelId: settings.model ?? '',
            enabled: Boolean(settings.enabled),
          };
        }),
      );

      setEntries(items);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void refresh();
  }, [isOpen, refresh]);

  const toggle = useCallback(
    async (providerId: string, enabled: boolean) => {
      setSaving(providerId);
      try {
        const current = await GetProviderSettings(providerId);
        await UpdateProviderSettings(
          providerId,
          domain.ProviderSettings.createFrom({ ...current, enabled }),
        );

        setEntries((prev) =>
          prev.map((entry) =>
            entry.provider.id === providerId ? { ...entry, enabled } : entry,
          ),
        );

        // Notify orchestrator store to re-filter active providers
        await useOrchestratorStore.getState().loadProviders(true);
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setSaving(null);
      }
    },
    [],
  );

  const select = useCallback(
    async (providerId: string, modelId: string) => {
      setSaving(providerId);
      try {
        const current = await GetProviderSettings(providerId);
        await UpdateProviderSettings(
          providerId,
          domain.ProviderSettings.createFrom({ ...current, model: modelId }),
        );

        setEntries((prev) =>
          prev.map((entry) =>
            entry.provider.id === providerId ? { ...entry, modelId } : entry,
          ),
        );

        const store = useOrchestratorStore.getState();
        store.setPreferredModel(providerId, modelId);
        if (modelId && store.selectedProviderId === providerId) {
          store.selectModelSilently(modelId);
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

  return { entries, error, isSaving, select, toggle };
}
