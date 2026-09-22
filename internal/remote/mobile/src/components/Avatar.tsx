import React from 'react'

interface AvatarProps {
  name: string
  size?: number
  active?: boolean
}

export default function Avatar({ name, size = 40, active = false }: AvatarProps) {
  const letter = name.charAt(0).toUpperCase()
  
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: active ? 'rgba(56,189,248,0.20)' : 'rgba(255,255,255,0.10)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: active ? '#38bdf8' : '#fff',
        fontSize: size * 0.4,
        fontWeight: 600,
        flexShrink: 0
      }}
    >
      {letter}
    </div>
  )
}
