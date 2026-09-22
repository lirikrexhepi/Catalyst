import React from 'react'
import { TaskState } from '../types'
import { stateColor } from '../utils'

export default function StatusPill({ state }: { state: TaskState }) {
  const color = stateColor(state)
  
  return (
    <span style={{ 
      color,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      fontWeight: 600,
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4
    }}>
      {state === 'running' && (
        <span 
          style={{
            width: 4, 
            height: 4, 
            borderRadius: '50%', 
            background: color,
            display: 'inline-block'
          }} 
        />
      )}
      {state}
    </span>
  )
}
