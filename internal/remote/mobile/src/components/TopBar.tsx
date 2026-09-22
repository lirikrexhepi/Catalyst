import React from 'react'

interface TopBarProps {
  title: string
  onMenu: () => void
  onNewChat?: () => void
  live?: boolean
}

export default function TopBar({ title, onMenu, onNewChat, live }: TopBarProps) {
  return (
    <div style={{ paddingTop: 'max(16px, env(safe-area-inset-top, 0px))', paddingRight: 12, paddingBottom: 4, paddingLeft: 12, display: 'flex', alignItems: 'center', gap: 10, maxWidth: '100%' }}>
      <button
        onClick={onMenu}
        aria-label="Menu"
        className="glass"
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-pri)',
          flexShrink: 0,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 7h16M4 12h10M4 17h16" />
        </svg>
      </button>

      <div
        className="glass"
        style={{
          flex: 1,
          minWidth: 0,
          height: 44,
          borderRadius: 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 7,
          padding: '0 14px',
        }}
      >
        {live !== undefined && (
          <span className={live ? 'live-dot' : undefined} style={live ? undefined : { width: 7, height: 7, borderRadius: '50%', background: 'var(--red)' }} />
        )}
        <span style={{ fontSize: 16.5, fontWeight: 700, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </span>
      </div>

      {onNewChat ? (
        <button
          onClick={onNewChat}
          aria-label="New chat"
          className="glass"
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-pri)',
            flexShrink: 0,
          }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </button>
      ) : (
        <div style={{ width: 44, flexShrink: 0 }} />
      )}
    </div>
  )
}
