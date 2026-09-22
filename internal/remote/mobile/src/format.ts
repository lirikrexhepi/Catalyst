import type { ModelChoice, OptionDescriptor, ProviderInfo } from './types'

/** 9s, 3:04, 1:02:07 — compact running time. */
export function elapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  if (m > 0) return `${m}:${String(s).padStart(2, '0')}`
  return `${s}s`
}

/** "took 1m 32s" style duration for finished turns. */
export function duration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  if (total < 60) return `${total}s`
  const m = Math.floor(total / 60)
  if (m < 60) return `${m}m ${String(total % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

export function relative(at?: number): string {
  if (!at) return ''
  const diff = Math.floor((Date.now() - at) / 1000)
  if (diff < 45) return 'now'
  if (diff < 3600) return `${Math.max(1, Math.round(diff / 60))}m`
  if (diff < 86400) return `${Math.round(diff / 3600)}h`
  if (diff < 86400 * 7) return `${Math.round(diff / 86400)}d`
  return new Date(at).toLocaleDateString([], { day: 'numeric', month: 'short' })
}

export function clock(at?: number): string {
  if (!at) return ''
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const PROVIDER_NAMES: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  antigravity: 'Antigravity',
  opencode: 'OpenCode',
}

export function providerName(driver?: string, providers: ProviderInfo[] = []): string {
  if (!driver) return ''
  return providers.find((p) => p.driver === driver)?.name || PROVIDER_NAMES[driver] || driver
}

function modelOptions(choice: ModelChoice, providers: ProviderInfo[]): OptionDescriptor[] {
  return providers.find((p) => p.driver === choice.driver)?.models.find((m) => m.id === choice.model)?.options ?? []
}

/** "Sonnet 4.5, high" — model name plus the non-default effort. */
export function choiceLabel(choice: ModelChoice | undefined, providers: ProviderInfo[]): string {
  if (!choice?.driver) return 'Choose a model'
  const model = providers.find((p) => p.driver === choice.driver)?.models.find((m) => m.id === choice.model)
  const name = model?.name || prettyModel(choice.model) || providerName(choice.driver, providers)
  const effort = choice.options?.effort
  if (typeof effort === 'string' && effort) {
    const label = modelOptions(choice, providers)
      .find((o) => o.id === 'effort')
      ?.choices?.find((c) => c.id === effort)?.label
    return `${name}, ${(label || effort).toLowerCase()}`
  }
  return name
}

export function prettyModel(id?: string): string {
  if (!id) return ''
  const last = id.split('/').pop() || id
  return last
    .split('-')
    .filter(Boolean)
    .map((w) => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

/** Default option values for a model, as the desktop sends them. */
export function defaultOptions(options: OptionDescriptor[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const o of options) {
    if (o.type === 'boolean') {
      if (typeof o.default === 'boolean') out[o.id] = o.default
    } else {
      const d = o.choices?.find((c) => c.default) ?? (o.default !== undefined ? o.choices?.find((c) => c.id === o.default) : undefined)
      if (d) out[o.id] = d.id
    }
  }
  return out
}

export function basename(path: string): string {
  return path.replace(/\\/g, '/').split('/').filter(Boolean).pop() || path
}

export function dirname(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}
