import { ChevronDown } from 'lucide-react'
import { CHEVRON_DOWN_NUDGE, GlassPill, GlassRing, type GlassBorderStyle } from '../../ui'
import { usageTone } from './usageTone'

interface ModelSwitchProps {
  label: string
  icon?: string
  usage?: number
  onClick: () => void
}

const RING_RIM: GlassBorderStyle = { light: { intensity: 0.22, backIntensity: 0.18 } }

export function ModelSwitch({ label, icon, usage = 0, onClick }: ModelSwitchProps) {
  return (
    <GlassPill as="button" width={175} height={44} fill="var(--glass-control)" onClick={onClick} aria-label={`Model: ${label}. Change`} className="model-switch">
      {icon ? <img src={icon} alt="" className="model-switch-icon" draggable={false} /> : null}
      <span className="model-switch-label">{label}</span>
      <GlassRing size={19} progress={usage} color={usageTone(usage)} strokeWidth={1.8} trackOpacity={0.4} border={RING_RIM}>
        <ChevronDown size={13} strokeWidth={2.5} style={CHEVRON_DOWN_NUDGE} aria-hidden />
      </GlassRing>
    </GlassPill>
  )
}
