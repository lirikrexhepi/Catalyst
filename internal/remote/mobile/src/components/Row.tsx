import React, { useState } from 'react'

interface RowProps {
  avatar: React.ReactNode
  title: string
  subtitle?: React.ReactNode
  timestamp?: string
  badge?: number
  onClick: () => void
  active?: boolean
  showDivider?: boolean
}

export default function Row({ avatar, title, subtitle, timestamp, badge, onClick, active, showDivider = true }: RowProps) {
  const [pressed, setPressed] = useState(false)

  return (
    <div className={showDivider ? 'divider-row' : ''} style={{ position: 'relative' }}>
      <div 
        onClick={onClick}
        onTouchStart={() => setPressed(true)}
        onTouchEnd={() => setPressed(false)}
        onTouchCancel={() => setPressed(false)}
        style={{
          height: 'var(--row-h)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          cursor: 'pointer',
          gap: 12,
          background: pressed || active ? 'rgba(255,255,255,0.05)' : 'transparent',
          transition: 'background 100ms'
        }}
      >
        {avatar}
        
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: 13, color: 'var(--text-mut)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
              {subtitle}
            </div>
          )}
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', minWidth: 48 }}>
          {timestamp && (
            <div style={{ fontSize: 12, color: 'var(--text-mut)', marginBottom: badge ? 4 : 0 }}>
              {timestamp}
            </div>
          )}
          {!!badge && badge > 0 && (
            <div style={{
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              height: 20,
              minWidth: 20,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 6px'
            }}>
              {badge}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
