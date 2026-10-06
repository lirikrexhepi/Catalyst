import { useCallback, useEffect, useState } from 'react';
import { GetProviderSettings, ListProviders, UpdateProviderSettings } from '../../../wailsjs/go/main/App';
import { domain } from '../../../wailsjs/go/models';
import { useOrchestratorStore } from '../orchestrator/useOrchestratorStore';
import { AIModel, CLIProvider } from '../orchestrator/types';
import { toModel, toProvider } from '../orchestrator/orchestratorData';

export interface EffortChoice {
  value: string;
  label: string;
}

export interface ProviderDefault {
  provider: CLIProvider;
  models: AIModel[];
  /** Empty means the CLI's own default is used rather than a pinned choice. */
  modelId: string;
  enabled: boolean;
  /** Backend effort id for the pinned model (e.g. "high"). Empty when the model has no effort knob. */
  effortId: string;
  effortChoices: EffortChoice[];
}

export interface DefaultModels {
  entries: ProviderDefault[];
  error: string | null;
  isSaving: string | null;
  select: (providerId: string, modelId: string) => Promise<void>;
  selectEffort: (providerId: string, effortId: string) => Promise<void>;
  toggle: (providerId: string, enabled: boolean) => Promise<void>;
}

const EFFORT_OPTION = 'effort';

function effortDescriptor(model: AIModel | undefined) {
  return model?.options?.find((option) => option.id === EFFORT_OPTION);
}

function resolveEffort(
  model: AIModel | undefined,
  saved: string,
): { effortId: string; choices: EffortChoice[] } {
  const descriptor = effortDescriptor(model);
  const choices: EffortChoice[] =
    descriptor?.choices?.map((choice) => ({ value: choice.id, label: choice.label })) ?? [];
  if (choices.length === 0) return { effortId: '', choices };
  if (saved && choices.some((choice) => choice.value === saved)) {
    return { effortId: saved, choices };
  }
  const fallback =
    descriptor?.choices?.find((choice) => choice.default)?.id ?? choices[0]?.value ?? '';
  return { effortId: fallback, choices };
}

function effortLabel(model: AIModel | undefined, effortId: string): string | null {
  const descriptor = effortDescriptor(model);
  return descriptor?.choices?.find((choice) => choice.id === effortId)?.label ?? null;
}

/**
 * Per-CLI preferred model, permission toggle and default effort.
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
          const modelId = settings.model ?? '';
          const model = models.find((m) => m.id === modelId);
          const savedEffort =
            typeof settings.options?.[EFFORT_OPTION] === 'string'
              ? (settings.options[EFFORT_OPTION] as string)
              : '';
          const { effortId, choices } = resolveEffort(model, savedEffort);

          return {
            provider,
            models,
            modelId,
            enabled: Boolean(settings.enabled),
            effortId,
            effortChoices: choices,
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
        const entry = entries.find((item) => item.provider.id === providerId);
        const model = entry?.models.find((m) => m.id === modelId);
        const previousEffort =
          typeof current.options?.[EFFORT_OPTION] === 'string'
            ? (current.options[EFFORT_OPTION] as string)
            : entry?.effortId ?? '';
        const { effortId } = resolveEffort(model, previousEffort);
        const options = { ...(current.options ?? {}) };
        if (model && effortDescriptor(model) && effortId) {
          options[EFFORT_OPTION] = effortId;
        } else {
          delete options[EFFORT_OPTION];
        }
        await UpdateProviderSettings(
          providerId,
          domain.ProviderSettings.createFrom({ ...current, model: modelId, options }),
        );

        setEntries((prev) =>
          prev.map((item) => {
            if (item.provider.id !== providerId) return item;
            const nextModel = item.models.find((m) => m.id === modelId);
            const resolved = resolveEffort(nextModel, effortId);
            return { ...item, modelId, effortId: resolved.effortId, effortChoices: resolved.choices };
          }),
        );

        const store = useOrchestratorStore.getState();
        store.setPreferredModel(providerId, modelId);
        if (modelId && store.selectedProviderId === providerId) {
          store.selectModelSilently(modelId);
        }
        if (model && effortId) {
          const label = effortLabel(model, effortId);
          if (label) store.setModelSettings(modelId, { effort: label });
        }
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setSaving(null);
      }
    },
    [entries],
  );

  const selectEffort = useCallback(
    async (providerId: string, effortId: string) => {
      setSaving(providerId);
      try {
        const current = await GetProviderSettings(providerId);
        const options = { ...(current.options ?? {}), [EFFORT_OPTION]: effortId };
        await UpdateProviderSettings(
          providerId,
          domain.ProviderSettings.createFrom({ ...current, options }),
        );

        setEntries((prev) =>
          prev.map((item) =>
            item.provider.id === providerId ? { ...item, effortId } : item,
          ),
        );

        const entry = entries.find((item) => item.provider.id === providerId);
        const model = entry?.models.find((m) => m.id === (entry?.modelId ?? current.model));
        const label = model ? effortLabel(model, effortId) : null;
        if (model && label) {
          useOrchestratorStore.getState().setModelSettings(model.id, { effort: label });
        }
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setSaving(null);
      }
    },
    [entries],
  );

  return { entries, error, isSaving, select, selectEffort, toggle };
}
