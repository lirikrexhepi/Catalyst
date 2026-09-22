import React from 'react'

interface NavHeaderProps {
  title: string
  subtitle?: string
  onBack?: () => void
  rightAction?: React.ReactNode
  large?: boolean
  transparent?: boolean
}

export default function NavHeader({ title, subtitle, onBack, rightAction, large, transparent }: NavHeaderProps) {
  return (
    <div
      className="safe-top"
      style={{
        background: transparent ? 'transparent' : 'rgba(0,0,0,0.72)',
        WebkitBackdropFilter: transparent ? 'none' : 'blur(24px) saturate(180%)',
        backdropFilter: transparent ? 'none' : 'blur(24px) saturate(180%)',
        borderBottom: transparent ? 'none' : '0.5px solid var(--border-div)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        width: '100%',
      }}
    >
      <div
        style={{
          minHeight: 50,
          display: 'grid',
          gridTemplateColumns: 'minmax(72px, 1fr) auto minmax(72px, 1fr)',
          alignItems: 'center',
          padding: '6px 8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
          {onBack && (
            <button
              onClick={onBack}
              style={{
                display: 'flex',
                alignItems: 'center',
                color: 'var(--accent)',
                fontSize: 17,
                padding: '8px 10px 8px 2px',
              }}
            >
              <svg width="13" height="21" viewBox="0 0 13 21" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 2L3 10.5 11 19" />
              </svg>
              <span style={{ marginLeft: 2 }}>Back</span>
            </button>
          )}
        </div>

        <div style={{ textAlign: 'center', minWidth: 0, maxWidth: '52vw' }}>
          {!large && (
            <>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: 'var(--text-pri)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  letterSpacing: '-0.01em',
                }}
              >
                {title}
              </div>
              {!!subtitle && (
                <div style={{ fontSize: 11, color: 'var(--text-mut)', marginTop: 1 }}>{subtitle}</div>
              )}
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6 }}>
          {rightAction}
        </div>
      </div>

      {large && (
        <div style={{ padding: '0 16px 10px' }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{title}</h1>
        </div>
      )}
    </div>
  )
}
