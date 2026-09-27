export const SCRUB = {
  hold: 160,
  slop: 5,
  maxChats: 40,
  step: 50,
  itemHeight: 28,
  pxPerChat: 34,
  overscroll: 0.35,
  boostFrom: 450,
  boostSpan: 1100,
  maxBoost: 1.6,
  magnetSpeed: 650,
  magnetMin: 1,
  magnetMax: 3.6,
  idleMs: 90,
  follow: { damping: 1, response: 0.1 },
  settle: { damping: 1, response: 0.26 },
  edgeBand: 56,
  edgeGive: 0.4,
  driftGap: 32,
  maxDrift: 9,
  armFraction: 0.16,
  armMin: 56,
  disarmRatio: 0.7,
  ticks: 9,
  tickMin: 4,
  tickMax: 12,
} as const

export const bell = (d: number, sigma: number) => Math.exp(-(d * d) / (2 * sigma * sigma))

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export function gain(speed: number): number {
  return 1 + SCRUB.maxBoost * clamp01((speed - SCRUB.boostFrom) / SCRUB.boostSpan)
}

export function magnet(raw: number, speed: number, max: number): number {
  const n = Math.round(raw)
  const f = raw - n
  const still = 1 - clamp01(speed / SCRUB.magnetSpeed)
  const k = SCRUB.magnetMin + (SCRUB.magnetMax - SCRUB.magnetMin) * still
  const pulled = n + Math.sign(f) * 0.5 * Math.pow(Math.abs(f) * 2, k)
  if (pulled < 0) return pulled * SCRUB.edgeGive
  if (pulled > max) return max + (pulled - max) * SCRUB.edgeGive
  return pulled
}

export function driftStarts(y0: number, top: number, bottom: number) {
  return {
    up: Math.min(top + SCRUB.edgeBand, y0 - SCRUB.driftGap),
    down: Math.max(bottom - SCRUB.edgeBand, y0 + SCRUB.driftGap),
  }
}

export function edgeDrift(y: number, up: number, down: number): number {
  const into = y < up ? y - up : y > down ? y - down : 0
  if (into === 0) return 0
  const t = clamp01(Math.abs(into) / SCRUB.edgeBand)
  return Math.sign(into) * SCRUB.maxDrift * t * t
}

export function slotPose(d: number, armness: number) {
  const dist = Math.abs(d)
  const scale = Math.max(0.74, 1 - 0.12 * dist) * (1 + 0.12 * armness * bell(d, 0.35))
  const opacity = dist <= 2 ? 1 - 0.3 * dist : Math.max(0, 0.4 * (1 - (dist - 2) / 0.7))
  const x = 12 * bell(d, 1.1)
  return { scale, opacity, x, y: d * SCRUB.step }
}

export function tickLength(k: number, active: boolean) {
  const center = (SCRUB.ticks - 1) / 2
  const peak = active ? SCRUB.tickMax + 2 : SCRUB.tickMax
  return SCRUB.tickMin + (peak - SCRUB.tickMin) * bell(k - center, 2)
}
