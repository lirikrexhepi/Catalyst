import React from 'react'
import { avatarGradient } from '../utils'

interface AvatarProps {
  name: string
  size?: number
  active?: boolean
}

export default function Avatar({ name, size = 56, active = false }: AvatarProps) {
  const letter = (name.trim().charAt(0) || '•').toUpperCase()
  const [from, to] = avatarGradient(name || 'x')

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `linear-gradient(135deg, ${from}, ${to})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize: size * 0.42,
        fontWeight: 700,
        flexShrink: 0,
        letterSpacing: '0.02em',
        boxShadow: active ? `0 0 0 2px var(--bg-main), 0 0 0 4px ${from}` : 'none',
      }}
    >
      {letter}
    </div>
  )
}
