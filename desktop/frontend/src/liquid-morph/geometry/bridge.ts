import { sampleOutline } from './squircle'

const SPREAD = 0.5
const HANDLE = 2.4
const THINNEST = 0.12
const TAU = Math.PI * 2

export interface Attach {
  x: number
  y: number
  normal: number
}

export type Outline = (angle: number) => Attach

interface Mark {
  angle: number
  x: number
  y: number
  nx: number
  ny: number
}

export function capsuleOutline(x: number, y: number, w: number, h: number, side: 'left' | 'right'): Outline {
  const r = h / 2
  const cx = side === 'right' ? x + w - r : x + r
  const cy = y + r
  const wrap = (a: number) => (side === 'left' && a < 0 ? a + TAU : a)
  const marks: Mark[] = sampleOutline({ width: w, height: h, radius: r }, 8)
    .filter((s) => (side === 'right' ? s.x >= w - h : s.x <= h))
    .map((s) => ({ angle: wrap(Math.atan2(s.y + y - cy, s.x + x - cx)), x: s.x + x, y: s.y + y, nx: s.nx, ny: s.ny }))
    .sort((a, b) => a.angle - b.angle)
  return (angle) => {
    const a = wrap(angle)
    let i = 0
    while (i < marks.length - 2 && marks[i + 1].angle < a) i++
    const m0 = marks[i]
    const m1 = marks[i + 1] ?? m0
    const span = m1.angle - m0.angle
    const t = span > 1e-9 ? Math.min(1, Math.max(0, (a - m0.angle) / span)) : 0
    return {
      x: m0.x + (m1.x - m0.x) * t,
      y: m0.y + (m1.y - m0.y) * t,
      normal: Math.atan2(m0.ny + (m1.ny - m0.ny) * t, m0.nx + (m1.nx - m0.nx) * t),
    }
  }
}

export function circleOutline(cx: number, cy: number, r: number): Outline {
  return (angle) => ({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), normal: angle })
}

const num = (n: number) => String(Math.round(n * 100) / 100)

export interface Bridge {
  fill: string
  edge: string
}

const NONE: Bridge = { fill: '', edge: '' }

export function bridgePath(c1x: number, r1: number, c2x: number, r2: number, cy: number, reach: number, a?: Outline, b?: Outline): Bridge {
  const d = c2x - c1x
  if (r1 <= 0.5 || r2 <= 0.5 || d <= Math.abs(r1 - r2) + 0.5) return NONE
  const touch = r1 + r2
  if (d >= touch + reach) return NONE
  let u1 = 0
  let u2 = 0
  if (d < touch) {
    u1 = Math.acos(Math.min(1, Math.max(-1, (r1 * r1 + d * d - r2 * r2) / (2 * r1 * d))))
    u2 = Math.acos(Math.min(1, Math.max(-1, (r2 * r2 + d * d - r1 * r1) / (2 * r2 * d))))
  }
  const stretch = d <= touch ? 0 : (d - touch) / reach
  const v = SPREAD * Math.pow(1 - stretch, 1.5)
  if (v < THINNEST) return NONE
  const spread = Math.acos(Math.min(1, Math.max(-1, (r1 - r2) / d)))
  const a1 = u1 + (spread - u1) * v
  const a3 = Math.PI - u2 - (Math.PI - u2 - spread) * v
  const outA = a ?? circleOutline(c1x, cy, r1)
  const outB = b ?? circleOutline(c2x, cy, r2)
  const p1 = outA(a1)
  const p2 = outA(-a1)
  const p3 = outB(a3)
  const p4 = outB(-a3)
  const handle = Math.min(v * HANDLE, Math.hypot(p3.x - p1.x, p3.y - p1.y) / touch) * Math.min(1, (d * 2) / touch)
  const k1 = r1 * handle
  const k2 = r2 * handle
  const toward = (p: Attach, turn: number, k: number) => ({ x: p.x + k * Math.cos(p.normal + turn), y: p.y + k * Math.sin(p.normal + turn) })
  const h1 = toward(p1, -Math.PI / 2, k1)
  const h2 = toward(p2, Math.PI / 2, k1)
  const h3 = toward(p3, Math.PI / 2, k2)
  const h4 = toward(p4, -Math.PI / 2, k2)
  const pt = (p: { x: number; y: number }) => `${num(p.x)} ${num(p.y)}`
  const lower = `M${pt(p1)}C${pt(h1)} ${pt(h3)} ${pt(p3)}`
  const upper = `M${pt(p4)}C${pt(h4)} ${pt(h2)} ${pt(p2)}`
  return { fill: `${lower}L${pt(p4)}C${pt(h4)} ${pt(h2)} ${pt(p2)}Z`, edge: `${lower}${upper}` }
}
