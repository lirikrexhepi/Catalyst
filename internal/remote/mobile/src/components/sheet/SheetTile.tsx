import type { ReactNode } from 'react'
import type { IconComponent } from '../../icons'
import { GlassSquircle } from '../../ui'
import { ICON_STROKE } from '../chrome/BarButton'
import { SHEET } from './layout'

interface SheetTileProps {
  icon: IconComponent
  label: string
  onClick: () => void
  tone?: 'danger'
  armed?: boolean
  disabled?: boolean
}

export function SheetTiles({ children }: { children: ReactNode }) {
  return <div className="sheet-tiles">{children}</div>
}

export function SheetTile({ icon: Icon, label, onClick, tone, armed, disabled }: SheetTileProps) {
  return (
    <GlassSquircle
      as="button"
      height={SHEET.tileHeight}
      radius={SHEET.tileRadius}
      fill={armed ? SHEET.tileArmed : SHEET.tileFill}
      className="sheet-tile"
      data-tone={tone}
      data-armed={armed ? 'true' : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon size={24} strokeWidth={ICON_STROKE} aria-hidden />
      <span>{label}</span>
    </GlassSquircle>
  )
}
