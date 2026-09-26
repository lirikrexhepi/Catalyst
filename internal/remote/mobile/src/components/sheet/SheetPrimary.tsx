import type { ReactNode } from 'react'
import { GlassPill } from '../../ui'
import { SHEET } from './layout'

interface SheetPrimaryProps {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}

export function SheetPrimary({ children, onClick, disabled }: SheetPrimaryProps) {
  return (
    <GlassPill
      as="button"
      height={SHEET.primaryHeight}
      fill={SHEET.primaryFill}
      className="sheet-primary"
      style={{ width: '100%', justifyContent: 'center' }}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </GlassPill>
  )
}

export function SheetNote({ children, tone }: { children: ReactNode; tone?: 'error' }) {
  return (
    <p className="sheet-note" data-tone={tone} role={tone === 'error' ? 'alert' : undefined}>
      {children}
    </p>
  )
}
