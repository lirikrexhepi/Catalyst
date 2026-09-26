import type { CSSProperties } from 'react'

export function nudge(x: number, y: number): CSSProperties {
  return { transform: `translate(${x}px, ${y}px)` }
}

export const SEND_NUDGE = nudge(-1, 1)
export const CHEVRON_LEFT_NUDGE = nudge(-1.2, 0)
export const CHEVRON_DOWN_NUDGE = nudge(0, 0.55)
