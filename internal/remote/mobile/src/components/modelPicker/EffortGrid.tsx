import { GlassSquircle } from '../../ui'
import type { OptionChoice } from '../../types'
import { effortLabel } from './effort'
import { PICKER } from './layout'

interface EffortGridProps {
  choices: OptionChoice[]
  selected?: string
  onPick: (id: string) => void
}

const BUTTON = PICKER.effortButton
const FULL_WIDTH = BUTTON.width * 2 + PICKER.effortColGap
const IDLE = 'linear-gradient(180deg, rgba(0,0,0,0.32), rgba(0,0,0,0) 38%), #181818'
const ACTIVE = 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0) 60%), #2c2c2c'

export function EffortGrid({ choices, selected, onPick }: EffortGridProps) {
  const lastAlone = choices.length % 2 === 1
  return (
    <div className="effort-grid" role="radiogroup" aria-label="Effort">
      {choices.map((c, i) => {
        const wide = lastAlone && i === choices.length - 1
        const active = c.id === selected
        return (
          <GlassSquircle
            key={c.id || 'default'}
            as="button"
            role="radio"
            aria-checked={active}
            width={wide ? FULL_WIDTH : BUTTON.width}
            height={BUTTON.height}
            radius={BUTTON.radius}
            fill={active ? ACTIVE : IDLE}
            pressable={{ drag: false }}
            className={wide ? 'effort-button wide' : 'effort-button'}
            onClick={() => onPick(c.id)}
          >
            <span className="effort-button-label">
              {effortLabel(c)}
              {c.default && c.id ? <sup className="effort-default">Default</sup> : null}
            </span>
          </GlassSquircle>
        )
      })}
    </div>
  )
}
