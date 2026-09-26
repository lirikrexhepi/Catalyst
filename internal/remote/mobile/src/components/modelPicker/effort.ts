import type { ModelChoice, ModelInfo, OptionChoice, OptionDescriptor } from '../../types'

const SHORT_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Xhigh',
  max: 'Max',
}

export function effortOption(model?: ModelInfo): OptionDescriptor | undefined {
  const option = model?.options?.find((o) => o.id === 'effort')
  return option?.type === 'select' && (option.choices?.length ?? 0) > 0 ? option : undefined
}

export function effortLabel(choice: OptionChoice): string {
  return SHORT_LABELS[choice.id] ?? choice.label
}

export function selectedEffort(option: OptionDescriptor | undefined, choice?: ModelChoice): OptionChoice | undefined {
  if (!option?.choices) return undefined
  const picked = choice?.options?.effort
  const id = typeof picked === 'string' ? picked : undefined
  return (
    option.choices.find((c) => c.id === id) ??
    option.choices.find((c) => c.default) ??
    option.choices.find((c) => c.id === option.default)
  )
}
