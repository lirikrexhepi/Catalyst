import type { ReactNode } from 'react'
import { Check, ChevronRight, type LucideIcon } from 'lucide-react'
import { ICON_STROKE } from '../chrome/BarButton'

interface SheetRowProps {
  icon?: LucideIcon
  iconNode?: ReactNode
  label: ReactNode
  detail?: string
  onClick?: () => void
  selected?: boolean
  chevron?: boolean
  tone?: 'danger'
  disabled?: boolean
  trailing?: ReactNode
}

export function SheetRow({ icon: Icon, iconNode, label, detail, onClick, selected, chevron, tone, disabled, trailing }: SheetRowProps) {
  const content = (
    <>
      {iconNode ?? (Icon ? <Icon size={22} strokeWidth={ICON_STROKE} className="sheet-row-icon" aria-hidden /> : null)}
      <span className="sheet-row-label">{label}</span>
      {detail ? <span className="sheet-row-detail">{detail}</span> : null}
      {trailing}
      {selected ? <Check size={20} strokeWidth={2} className="sheet-row-check" aria-hidden /> : null}
      {chevron ? <ChevronRight size={18} strokeWidth={2} className="sheet-row-chevron" aria-hidden /> : null}
    </>
  )
  if (!onClick) {
    return (
      <div className="sheet-row" data-tone={tone}>
        {content}
      </div>
    )
  }
  return (
    <button type="button" className="sheet-row" data-tone={tone} aria-pressed={selected} disabled={disabled} onClick={onClick}>
      {content}
    </button>
  )
}
