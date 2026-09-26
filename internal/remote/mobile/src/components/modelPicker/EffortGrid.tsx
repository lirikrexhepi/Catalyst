import type { ReactNode } from 'react'
import { GlassSquircle } from '../../ui'
import type { OptionChoice } from '../../types'
import { effortLabel, type Toggle } from './effort'
import { PICKER } from './layout'

interface EffortGridProps {
  choices: OptionChoice[]
  selected?: string
  toggles: Toggle[]
  onPick: (id: string) => void
  onToggle: (id: string) => void
}

const BUTTON = PICKER.effortButton
const FULL_WIDTH = BUTTON.width * 2 + PICKER.effortColGap
const IDLE = 'linear-gradient(180deg, rgba(0,0,0,0.32), rgba(0,0,0,0) 38%), #181818'
const ACTIVE = 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0) 60%), #2c2c2c'

interface CellProps {
  wide: boolean
  active: boolean
  role: 'radio' | 'switch'
  onClick: () => void
  children: ReactNode
}

function Cell({ wide, active, role, onClick, children }: CellProps) {
  return (
    <GlassSquircle
      as="button"
      role={role}
      aria-checked={active}
      width={wide ? FULL_WIDTH : BUTTON.width}
      height={BUTTON.height}
      radius={BUTTON.radius}
      fill={active ? ACTIVE : IDLE}
      pressable={{ drag: false }}
      className={wide ? 'effort-button wide' : 'effort-button'}
      onClick={onClick}
    >
      <span className="effort-button-label">{children}</span>
    </GlassSquircle>
  )
}

const isWide = (index: number, count: number) => count % 2 === 1 && index === count - 1

export function EffortGrid({ choices, selected, toggles, onPick, onToggle }: EffortGridProps) {
  return (
    <div className="effort-grid">
      {choices.length > 0 ? (
        <div className="effort-group" role="radiogroup" aria-label="Effort">
          {choices.map((c, i) => (
            <Cell key={c.id || 'default'} wide={isWide(i, choices.length)} active={c.id === selected} role="radio" onClick={() => onPick(c.id)}>
              {effortLabel(c)}
              {c.default && c.id ? <sup className="effort-default">Default</sup> : null}
            </Cell>
          ))}
        </div>
      ) : null}
      {toggles.length > 0 ? (
        <div className="effort-group" aria-label="Modes">
          {toggles.map((t, i) => (
            <Cell key={t.id} wide={isWide(i, toggles.length)} active={t.on} role="switch" onClick={() => onToggle(t.id)}>
              {t.label}
            </Cell>
          ))}
        </div>
      ) : null}
    </div>
  )
}
