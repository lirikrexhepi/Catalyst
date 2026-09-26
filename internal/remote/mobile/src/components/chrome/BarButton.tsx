import type { LucideIcon } from 'lucide-react'
import { GlassCircle } from '../../ui'

export const ICON_STROKE = 1.75

interface BarButtonProps {
  icon: LucideIcon
  label: string
  onClick: () => void
  disabled?: boolean
}

export function BarButton({ icon: Icon, label, onClick, disabled }: BarButtonProps) {
  return (
    <GlassCircle size={44} fill="var(--glass-control)" onClick={onClick} disabled={disabled} aria-label={label}>
      <Icon size={24} strokeWidth={ICON_STROKE} aria-hidden />
    </GlassCircle>
  )
}
