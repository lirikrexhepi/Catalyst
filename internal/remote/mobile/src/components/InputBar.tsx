import React, { useState } from 'react'
import { Send, Square } from 'lucide-react'

interface InputBarProps {
  placeholder?: string
  onSend: (text: string) => void
  onStop?: () => void
  isRunning?: boolean
  disabled?: boolean
}

export default function InputBar({ placeholder = 'Message...', onSend, onStop, isRunning, disabled }: InputBarProps) {
  const [text, setText] = useState('')

  const handleSend = () => {
    if (!text.trim() || disabled) return
    onSend(text.trim())
    setText('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="safe-bottom" style={{
      background: 'rgba(3,3,3,0.90)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderTop: '1px solid var(--border-div)',
      padding: '8px 16px',
      width: '100%',
      position: 'relative' // If fixed bottom needed, parent screen wrapper manages it
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <input 
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 20,
            padding: '10px 16px',
            fontSize: 15,
            color: 'white'
          }}
        />
        
        {isRunning && onStop ? (
          <button onClick={onStop} style={{
            width: 36, height: 36,
            borderRadius: 12,
            background: 'rgba(255,255,255,0.10)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer'
          }}>
            <Square size={16} fill="white" color="white" />
          </button>
        ) : (
          text.trim().length > 0 && (
            <button onClick={handleSend} disabled={disabled} style={{
              width: 36, height: 36,
              borderRadius: '50%',
              background: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer'
            }}>
              <Send size={16} color="white" style={{ marginLeft: 2 }} />
            </button>
          )
        )}
      </div>
    </div>
  )
}
