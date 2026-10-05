import { Check, RefreshCw } from '../../icons'
import { GlassSquircle } from '../../ui'
import type { ModelChoice, ProviderInfo } from '../../types'
import { effortLabel, effortOption, selectedEffort } from './effort'
import { ProviderIcon } from './ProviderIcon'

interface ModelListProps {
  provider?: ProviderInfo
  value?: ModelChoice
  status: 'ready' | 'checking' | 'none'
  onPick: (modelId: string) => void
  onRetry: () => void
}

export function ModelList({ provider, value, status, onPick, onRetry }: ModelListProps) {
  if (status !== 'ready' || !provider) {
    return (
      <div className="picker-list picker-empty">
        {status === 'checking' ? (
          <>
            <RefreshCw size={20} className="spin" aria-hidden />
            <span>Checking for agent CLIs…</span>
          </>
        ) : (
          <>
            <span>No agent CLIs found on your PC</span>
            <GlassSquircle as="button" radius={12} fill="var(--surface-2)" border={false} className="picker-retry" onClick={onRetry}>
              Retry
            </GlassSquircle>
          </>
        )}
      </div>
    )
  }

  const current = value?.driver === provider.driver ? value : undefined
  const models = provider.models.length > 0 ? provider.models : [{ id: '', name: 'CLI default' }]

  return (
    <div className="picker-list" role="listbox" aria-label={`${provider.name} models`}>
      {models.map((m) => {
        const selected = current?.model === m.id
        const effort = selected ? selectedEffort(effortOption(m), current) : undefined
        return (
          <button key={m.id || 'default'} role="option" aria-selected={selected} className="model-row" onClick={() => onPick(m.id)}>
            <ProviderIcon driver={provider.driver} name={provider.name} size={24} />
            <span className="model-row-name">{m.name}</span>
            {effort ? <span className="model-row-effort">{effortLabel(effort)}</span> : null}
            {selected && !effort ? <Check size={14} className="model-row-effort" aria-hidden /> : null}
          </button>
        )
      })}
    </div>
  )
}
