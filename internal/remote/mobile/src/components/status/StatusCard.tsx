import type { ReactNode } from 'react'
import { CircleAlert, type IconComponent } from '../../icons'
import { GlassPill, GlassSquircle } from '../../ui'
import { SHEET } from '../sheet'

interface StatusCardProps {
  children: ReactNode
  title?: string
  icon?: IconComponent
  action?: { label: string; onClick: () => void }
  className?: string
}

export function StatusCard({ children, title, icon: Icon = CircleAlert, action, className = '' }: StatusCardProps) {
  return (
    <GlassSquircle radius={20} fill={SHEET.fill} pressable={false} className={`status-card ${className}`.trim()} role="alert">
      <Icon size={18} strokeWidth={2} className="status-card-icon" aria-hidden />
      <div className="status-card-text">
        {title ? <strong>{title}</strong> : null}
        <span>{children}</span>
      </div>
      {action ? (
        <GlassPill as="button" height={36} fill="var(--glass-control)" className="status-card-action" onClick={action.onClick}>
          {action.label}
        </GlassPill>
      ) : null}
    </GlassSquircle>
  )
}
