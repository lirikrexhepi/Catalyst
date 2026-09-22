import React, { useState } from 'react'

interface RowProps {
  avatar: React.ReactNode
  title: string
  subtitle?: React.ReactNode
  timestamp?: string
  badge?: number
  ticks?: boolean
  onClick: () => void
}

export default function Row({ avatar, title, subtitle, timestamp, badge, ticks, onClick }: RowProps) {
  const [pressed, setPressed] = useState(false)

  return (
    <div
      onClick={onClick}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      onTouchCancel={() => setPressed(false)}
      style={{
        minHeight: 'var(--row-h)',
        display: 'flex',
        alignItems: 'center',
        padding: '9px 14px 9px 12px',
        cursor: 'pointer',
        gap: 12,
        background: pressed ? 'rgba(255,255,255,0.06)' : 'transparent',
        transition: 'background 120ms',
      }}
    >
      {avatar}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
          <div style={{ flex: 1, fontSize: 16.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.01em' }}>
            {title}
          </div>
          {timestamp && (
            <div style={{ fontSize: 13, color: badge ? 'var(--accent)' : 'var(--text-mut)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
              {ticks && (
                <svg width="17" height="11" viewBox="0 0 18 12" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1.5 6.5L4.5 9.5 11 2.5" />
                  <path d="M7 7.5l2.5 2.5L17 3" />
                </svg>
              )}
              {timestamp}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {subtitle && (
            <div style={{ flex: 1, fontSize: 14.5, color: 'var(--text-mut)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.35 }}>
              {subtitle}
            </div>
          )}
          {!!badge && badge > 0 && (
            <div style={{
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              height: 22,
              minWidth: 22,
              borderRadius: 11,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 7px',
              flexShrink: 0,
            }}>
              {badge > 99 ? '99+' : badge}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
