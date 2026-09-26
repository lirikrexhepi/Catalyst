import { ChevronDown } from 'lucide-react'
import { GlassPill, GlassRing } from '../../ui'
import { usageTone } from './usageTone'

interface ModelSwitchProps {
  label: string
  icon?: string
  usage?: number
  onClick: () => void
}

export function ModelSwitch({ label, icon, usage = 0, onClick }: ModelSwitchProps) {
  return (
    <GlassPill as="button" width={175} height={44} fill="var(--glass-control)" onClick={onClick} aria-label={`Model: ${label}. Change`} className="model-switch">
      {icon ? <img src={icon} alt="" className="model-switch-icon" draggable={false} /> : null}
      <span className="model-switch-label">{label}</span>
      <GlassRing size={19} progress={usage} color={usageTone(usage)}>
        <ChevronDown size={13} strokeWidth={2.5} aria-hidden />
      </GlassRing>
    </GlassPill>
  )
}
