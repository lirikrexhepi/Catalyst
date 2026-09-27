import { GlassSquircle } from '../../ui'
import type { ProviderInfo } from '../../types'
import { PICKER } from './layout'
import { ProviderIcon } from './ProviderIcon'

interface ProviderBarProps {
  providers: ProviderInfo[]
  active: string
  onPick: (driver: string) => void
}

const MAX_PROVIDERS = 4

export function ProviderBar({ providers, active, onPick }: ProviderBarProps) {
  const shown = providers.slice(0, MAX_PROVIDERS)
  return (
    <GlassSquircle
      width={PICKER.barWidth}
      height={PICKER.bar}
      radius={PICKER.barRadius}
      fill="var(--bar)"
      role="tablist"
      aria-label="Agent CLI"
      className="picker-bar provider-bar"
      data-count={shown.length}
    >
      {shown.map((p) => (
        <button
          key={p.driver}
          role="tab"
          aria-selected={p.driver === active}
          aria-label={p.name}
          className="provider-tab"
          onClick={() => onPick(p.driver)}
        >
          <ProviderIcon driver={p.driver} name={p.name} size={30} />
        </button>
      ))}
    </GlassSquircle>
  )
}
