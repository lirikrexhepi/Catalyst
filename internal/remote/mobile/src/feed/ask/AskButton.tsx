import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { GlassPill, GlassSquircle } from '../../ui'

interface AskButtonProps {
  children: ReactNode
  onClick: () => void
  tone?: 'primary' | 'danger'
  grow?: boolean
  disabled?: boolean
}

export function AskButton({ children, onClick, tone, grow, disabled }: AskButtonProps) {
  return (
    <GlassPill
      as="button"
      height={44}
      fill={tone === 'primary' ? 'var(--send)' : 'var(--glass-control)'}
      className="ask-button"
      data-tone={tone}
      style={{ flex: grow ? '1 1 0' : '0 0 auto', justifyContent: 'center' }}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </GlassPill>
  )
}

interface AskOptionProps {
  selected: boolean
  onSelect: () => void
  children: ReactNode
  as?: 'button' | 'div'
}

export function AskOption({ selected, onSelect, children, as = 'button' }: AskOptionProps) {
  return (
    <GlassSquircle
      as={as}
      radius={16}
      fill={selected ? '#00417F' : '#2a2a2a'}
      className="ask-option"
      aria-pressed={as === 'button' ? selected : undefined}
      pressable={as === 'button'}
      onClick={onSelect}
    >
      <span className="ask-option-label">{children}</span>
      {selected ? <Check size={18} strokeWidth={2} className="ask-option-check" aria-hidden /> : null}
    </GlassSquircle>
  )
}
