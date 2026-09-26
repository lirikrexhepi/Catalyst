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

export interface Toggle {
  id: string
  label: string
  on: boolean
}

export function toggleOptions(model: ModelInfo | undefined, choice?: ModelChoice): Toggle[] {
  return (model?.options ?? [])
    .filter((o) => o.type === 'boolean')
    .map((o) => {
      const value = choice?.options?.[o.id]
      const on = typeof value === 'boolean' ? value : o.default === true
      return { id: o.id, label: o.label.charAt(0).toUpperCase() + o.label.slice(1).toLowerCase(), on }
    })
}
