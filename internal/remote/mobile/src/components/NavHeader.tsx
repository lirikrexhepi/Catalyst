import React from 'react'
import { ChevronLeft } from 'lucide-react'

interface NavHeaderProps {
  title: string
  onBack?: () => void
  rightAction?: React.ReactNode
  large?: boolean
}

export default function NavHeader({ title, onBack, rightAction, large }: NavHeaderProps) {
  return (
    <div style={{
      background: 'rgba(3,3,3,0.85)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: '1px solid var(--border-div)',
      position: 'sticky',
      top: 0,
      zIndex: 10,
      width: '100%'
    }}>
      <div className="safe-top" style={{
        height: 44,
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        position: 'relative'
      }}>
        {/* Left */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          {onBack && (
            <button 
              onClick={onBack}
              style={{
                display: 'flex',
                alignItems: 'center',
                color: 'var(--text-sec)',
                cursor: 'pointer',
                marginRight: 8,
                marginLeft: -8
              }}
            >
              <ChevronLeft size={24} />
              <span style={{ fontSize: 14 }}>Back</span>
            </button>
          )}
        </div>
        
        {/* Center */}
        <div style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 17,
          fontWeight: 600,
          color: 'var(--text-pri)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '50%'
        }}>
          {!large && title}
        </div>

        {/* Right */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          {rightAction}
        </div>
      </div>
      
      {/* Large Title */}
      {large && (
        <div style={{ padding: '8px 16px 12px' }}>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>{title}</h1>
        </div>
      )}
    </div>
  )
}
