import { AIModel, CLIProvider, ModelSettings, OptionDescriptor } from './types';
import { providerIcon } from './providerIcons';
import { domain } from '../../../wailsjs/go/models';

export const EFFORT_OPTION = 'effort';
export const THINKING_OPTION = 'thinking';

/** Providers and models are discovered at runtime, so there is no static data. */
export const DEFAULT_PROVIDERS: CLIProvider[] = [];
export const DEFAULT_MODELS: AIModel[] = [];

export function toProvider(snapshot: domain.ProviderSnapshot): CLIProvider {
  return {
    id: snapshot.driver,
    name: snapshot.displayName,
    icon: providerIcon(snapshot.driver),
    availability: snapshot.availability,
    version: snapshot.version,
    message: snapshot.message,
  };
}

export function toModel(snapshot: domain.ProviderSnapshot, model: domain.Model): AIModel {
  const options = (model.options ?? []) as OptionDescriptor[];
  const effort = options.find((option) => option.id === EFFORT_OPTION);
  const thinking = options.find((option) => option.id === THINKING_OPTION);
  const defaultChoice = effort?.choices?.find((choice) => choice.default);

  return {
    id: model.id,
    name: model.displayName,
    providerId: snapshot.driver,
    icon: providerIcon(snapshot.driver),
    supportsThinking: Boolean(thinking),
    effortLevels: effort?.choices?.map((choice) => choice.label) ?? [],
    defaultEffort: defaultChoice?.label,
    defaultMode: thinking?.default === true ? 'thinking' : 'normal',
    options,
  };
}

/**
 * Translates the picker's label-based selections back into the backend option
 * ids that become CLI flags. Options the UI does not surface (context window)
 * fall through to their advertised default so behaviour stays predictable.
 */
export function toModelOptions(
  model: AIModel | undefined,
  settings: ModelSettings,
): Record<string, unknown> {
  if (!model?.options?.length) return {};

  const payload: Record<string, unknown> = {};
  for (const option of model.options) {
    if (option.type === 'boolean') {
      if (option.id === THINKING_OPTION) {
        payload[option.id] = settings.mode === 'thinking';
      } else if (typeof option.default === 'boolean') {
        payload[option.id] = option.default;
      }
      continue;
    }

    if (option.id === EFFORT_OPTION) {
      const match =
        option.choices?.find((choice) => choice.label === settings.effort) ??
        option.choices?.find((choice) => choice.default);
      if (match) payload[option.id] = match.id;
      continue;
    }

    const fallback = option.choices?.find((choice) => choice.default);
    if (fallback) payload[option.id] = fallback.id;
  }
  return payload;
}
