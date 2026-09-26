export type CornerRadii = number | readonly [number, number, number, number]

export interface Size {
  width: number
  height: number
}

export interface SquircleShape extends Size {
  radius: CornerRadii
  smoothing?: number
}

export interface Point {
  x: number
  y: number
}

export interface OutlineSample extends Point {
  nx: number
  ny: number
}

type Segment =
  | { kind: 'line'; from: Point; to: Point }
  | { kind: 'cubic'; from: Point; c1: Point; c2: Point; to: Point }
  | { kind: 'arc'; from: Point; to: Point; radius: number }

interface Corner {
  a: number
  b: number
  c: number
  d: number
  p: number
  arc: number
  radius: number
}

interface Frame {
  u: Point
  v: Point
}

const FRAMES: readonly Frame[] = [
  { u: { x: 1, y: 0 }, v: { x: 0, y: 1 } },
  { u: { x: 0, y: 1 }, v: { x: -1, y: 0 } },
  { u: { x: -1, y: 0 }, v: { x: 0, y: -1 } },
  { u: { x: 0, y: -1 }, v: { x: 1, y: 0 } },
]

const toRad = (deg: number) => (deg * Math.PI) / 180

export function cornerList(radius: CornerRadii): [number, number, number, number] {
  return typeof radius === 'number' ? [radius, radius, radius, radius] : [radius[0], radius[1], radius[2], radius[3]]
}

export function radiusKey(radius: CornerRadii): string {
  return typeof radius === 'number' ? String(radius) : radius.join(',')
}

export function shapeKey(shape: SquircleShape): string {
  const round = (n: number) => Math.round(n * 100) / 100
  return `${round(shape.width)}x${round(shape.height)}r${radiusKey(shape.radius)}s${shape.smoothing ?? 1}`
}

export function isFullyRound(shape: SquircleShape): boolean {
  const budget = Math.min(shape.width, shape.height) / 2
  return cornerList(shape.radius).every((r) => r >= budget)
}

function cornerFor(radius: number, smoothing: number, budget: number): Corner {
  const r = Math.max(0, Math.min(radius, budget))
  if (r === 0 || budget <= 0) return { a: 0, b: 0, c: 0, d: 0, p: 0, arc: 0, radius: 0 }
  const xi = Math.max(0, Math.min(smoothing, budget / r - 1))
  const p = Math.min((1 + smoothing) * r, budget)
  const arcMeasure = 90 * (1 - xi)
  const arc = Math.sin(toRad(arcMeasure / 2)) * r * Math.SQRT2
  const alpha = (90 - arcMeasure) / 2
  const p3ToP4 = r * Math.tan(toRad(alpha / 2))
  const beta = 45 * xi
  const c = p3ToP4 * Math.cos(toRad(beta))
  const d = c * Math.tan(toRad(beta))
  const b = (p - arc - c - d) / 3
  return { a: 2 * b, b, c, d, p, arc, radius: r }
}

function step(origin: Point, frame: Frame, du: number, dv: number): Point {
  return {
    x: origin.x + frame.u.x * du + frame.v.x * dv,
    y: origin.y + frame.u.y * du + frame.v.y * dv,
  }
}

function cornerSegments(start: Point, frame: Frame, k: Corner): Segment[] {
  if (k.radius === 0) return []
  const reach = k.a + k.b + k.c
  const arcStart = step(start, frame, reach, k.d)
  const arcEnd = step(arcStart, frame, k.arc, k.arc)
  return [
    { kind: 'cubic', from: start, c1: step(start, frame, k.a, 0), c2: step(start, frame, k.a + k.b, 0), to: arcStart },
    { kind: 'arc', from: arcStart, to: arcEnd, radius: k.radius },
    { kind: 'cubic', from: arcEnd, c1: step(arcEnd, frame, k.d, k.c), c2: step(arcEnd, frame, k.d, k.b + k.c), to: step(arcEnd, frame, k.d, reach) },
  ]
}

type CornerName = 'tl' | 'tr' | 'br' | 'bl'

const NEIGHBOURS: Record<CornerName, readonly [CornerName, 'x' | 'y'][]> = {
  tl: [['tr', 'x'], ['bl', 'y']],
  tr: [['tl', 'x'], ['br', 'y']],
  bl: [['br', 'x'], ['tl', 'y']],
  br: [['bl', 'x'], ['tr', 'y']],
}

function distribute(width: number, height: number, radius: CornerRadii): Record<CornerName, { radius: number; budget: number }> {
  const [tl, tr, br, bl] = cornerList(radius)
  const radii: Record<CornerName, number> = { tl, tr, bl, br }
  const budgets: Record<CornerName, number> = { tl: -1, tr: -1, bl: -1, br: -1 }
  const order = (['tl', 'tr', 'bl', 'br'] as const).slice().sort((a, b) => radii[b] - radii[a])
  for (const name of order) {
    const r = radii[name]
    const budget = Math.min(
      ...NEIGHBOURS[name].map(([other, axis]) => {
        if (r === 0 && radii[other] === 0) return 0
        const side = axis === 'x' ? width : height
        return budgets[other] >= 0 ? side - budgets[other] : (r / (r + radii[other])) * side
      }),
    )
    budgets[name] = budget
    radii[name] = Math.min(r, budget)
  }
  return {
    tl: { radius: radii.tl, budget: budgets.tl },
    tr: { radius: radii.tr, budget: budgets.tr },
    br: { radius: radii.br, budget: budgets.br },
    bl: { radius: radii.bl, budget: budgets.bl },
  }
}

function squircleSegments(shape: SquircleShape): Segment[] {
  const { width: w, height: h } = shape
  const smoothing = shape.smoothing ?? 1
  const spread = distribute(w, h, shape.radius)
  const corners = (['tr', 'br', 'bl', 'tl'] as const).map((n) => cornerFor(spread[n].radius, smoothing, spread[n].budget))
  const starts: Point[] = [
    { x: w - corners[0].p, y: 0 },
    { x: w, y: h - corners[1].p },
    { x: corners[2].p, y: h },
    { x: 0, y: corners[3].p },
  ]
  const segments: Segment[] = []
  for (let i = 0; i < 4; i++) {
    const curve = cornerSegments(starts[i], FRAMES[i], corners[i])
    segments.push(...curve)
    const end = curve.length > 0 ? curve[curve.length - 1].to : starts[i]
    segments.push({ kind: 'line', from: end, to: starts[(i + 1) % 4] })
  }
  return segments
}

const num = (n: number) => String(Math.round(n * 1000) / 1000)

export function squirclePath(shape: SquircleShape, offset = 0): string {
  if (shape.width <= 0 || shape.height <= 0) return ''
  const pt = (p: Point) => `${num(p.x + offset)} ${num(p.y + offset)}`
  const segments = squircleSegments(shape)
  let d = `M${pt(segments[0].from)}`
  for (const s of segments) {
    if (s.kind === 'line') d += `L${pt(s.to)}`
    else if (s.kind === 'cubic') d += `C${pt(s.c1)} ${pt(s.c2)} ${pt(s.to)}`
    else d += `A${num(s.radius)} ${num(s.radius)} 0 0 1 ${pt(s.to)}`
  }
  return `${d}Z`
}

function outward(tx: number, ty: number): Point | null {
  const len = Math.hypot(tx, ty)
  return len < 1e-9 ? null : { x: ty / len, y: -tx / len }
}

function cubicAt(s: Extract<Segment, { kind: 'cubic' }>, t: number): OutlineSample | null {
  const m = 1 - t
  const x = m * m * m * s.from.x + 3 * m * m * t * s.c1.x + 3 * m * t * t * s.c2.x + t * t * t * s.to.x
  const y = m * m * m * s.from.y + 3 * m * m * t * s.c1.y + 3 * m * t * t * s.c2.y + t * t * t * s.to.y
  const tx = 3 * m * m * (s.c1.x - s.from.x) + 6 * m * t * (s.c2.x - s.c1.x) + 3 * t * t * (s.to.x - s.c2.x)
  const ty = 3 * m * m * (s.c1.y - s.from.y) + 6 * m * t * (s.c2.y - s.c1.y) + 3 * t * t * (s.to.y - s.c2.y)
  const n = outward(tx, ty)
  return n ? { x, y, nx: n.x, ny: n.y } : null
}

function arcSamples(s: Extract<Segment, { kind: 'arc' }>, count: number): OutlineSample[] {
  const cx = s.to.x - s.from.x
  const cy = s.to.y - s.from.y
  const chord = Math.hypot(cx, cy)
  if (chord < 1e-9) return []
  const rise = Math.sqrt(Math.max(0, s.radius * s.radius - (chord / 2) * (chord / 2)))
  const center = {
    x: (s.from.x + s.to.x) / 2 - (cy / chord) * rise,
    y: (s.from.y + s.to.y) / 2 + (cx / chord) * rise,
  }
  const a0 = Math.atan2(s.from.y - center.y, s.from.x - center.x)
  let sweep = Math.atan2(s.to.y - center.y, s.to.x - center.x) - a0
  while (sweep <= 0) sweep += Math.PI * 2
  const out: OutlineSample[] = []
  for (let i = 0; i <= count; i++) {
    const a = a0 + (sweep * i) / count
    const nx = Math.cos(a)
    const ny = Math.sin(a)
    out.push({ x: center.x + nx * s.radius, y: center.y + ny * s.radius, nx, ny })
  }
  return out
}

export function sampleOutline(shape: SquircleShape, perSegment = 10): OutlineSample[] {
  if (shape.width <= 0 || shape.height <= 0) return []
  const out: OutlineSample[] = []
  for (const s of squircleSegments(shape)) {
    if (s.kind === 'line') {
      const n = outward(s.to.x - s.from.x, s.to.y - s.from.y)
      if (!n) continue
      out.push({ ...s.from, nx: n.x, ny: n.y }, { ...s.to, nx: n.x, ny: n.y })
    } else if (s.kind === 'cubic') {
      for (let i = 0; i <= perSegment; i++) {
        const sample = cubicAt(s, i / perSegment)
        if (sample) out.push(sample)
      }
    } else {
      out.push(...arcSamples(s, perSegment))
    }
  }
  return out
}
