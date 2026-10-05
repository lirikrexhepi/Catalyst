import type { ReactNode } from 'react'
import type { IconComponent } from '../../icons'
import { GlassSquircle } from '../../ui'
import { SHEET } from '../../components/sheet'

interface AskCardProps {
  icon: IconComponent
  label: string
  children: ReactNode
}

export function AskCard({ icon: Icon, label, children }: AskCardProps) {
  return (
    <GlassSquircle radius={24} fill={SHEET.fill} pressable={false} className="ask-card" role="group" aria-label={label}>
      <div className="ask-card-head">
        <Icon size={16} strokeWidth={2} aria-hidden />
        <span>{label}</span>
      </div>
      {children}
    </GlassSquircle>
  )
}

export function AskDone({ icon: Icon, children }: { icon: IconComponent; children: ReactNode }) {
  return (
    <div className="ask-done">
      <Icon size={16} strokeWidth={2} aria-hidden />
      <span>{children}</span>
    </div>
  )
}
