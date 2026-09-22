import React, { useState } from 'react'

interface InputBarProps {
  placeholder?: string
  onSend: (text: string) => void
  onStop?: () => void
  isRunning?: boolean
  disabled?: boolean
}

export default function InputBar({ placeholder = 'Message', onSend, onStop, isRunning, disabled }: InputBarProps) {
  const [text, setText] = useState('')

  const handleSend = () => {
    if (!text.trim() || disabled) return
    onSend(text.trim())
    setText('')
  }

  return (
    <div className="safe-bottom" style={{ padding: '6px 10px 10px', background: 'transparent' }}>
      <div
        className="glass"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderRadius: 28,
          padding: '6px 6px 6px 16px',
          minHeight: 52,
        }}
      >
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          style={{ flex: 1, fontSize: 16, color: '#fff', background: 'transparent', minWidth: 0 }}
        />

        {isRunning && onStop ? (
          <button
            onClick={onStop}
            aria-label="Stop"
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span style={{ width: 13, height: 13, borderRadius: 3.5, background: '#fff' }} />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={disabled || !text.trim()}
            aria-label="Send"
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: text.trim() ? 'var(--accent)' : 'rgba(255,255,255,0.10)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              opacity: text.trim() ? 1 : 0.6,
              transition: 'background 160ms',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff">
              <path d="M3.4 20.4l17.5-8.4L3.4 3.6l-.01 6.53L14 12 3.39 13.87l.01 6.53z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
