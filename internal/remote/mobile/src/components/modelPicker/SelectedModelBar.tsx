import { ChevronLeft } from 'lucide-react'
import { CHEVRON_LEFT_NUDGE, GlassRing, GlassSquircle } from '../../ui'
import { usageTone } from '../chrome/usageTone'
import { PICKER } from './layout'
import { ProviderIcon } from './ProviderIcon'

interface SelectedModelBarProps {
  driver: string
  providerName?: string
  modelName: string
  usage: number
  onBack: () => void
}

const RING_RIM = { light: { intensity: 0.22, backIntensity: 0.18 } }

export function SelectedModelBar({ driver, providerName, modelName, usage, onBack }: SelectedModelBarProps) {
  return (
    <GlassSquircle width={PICKER.barWidth} height={PICKER.bar} radius={PICKER.barRadius} fill="#191919" className="picker-bar selected-bar">
      <ProviderIcon driver={driver} name={providerName} size={24} />
      <span className="selected-bar-name">{modelName}</span>
      <button className="selected-bar-back" onClick={onBack} aria-label="Back to models">
        <GlassRing size={34} progress={usage} color={usageTone(usage)} strokeWidth={2} trackOpacity={0.4} border={RING_RIM}>
          <ChevronLeft size={28} strokeWidth={1.75} style={CHEVRON_LEFT_NUDGE} aria-hidden />
        </GlassRing>
      </button>
    </GlassSquircle>
  )
}
