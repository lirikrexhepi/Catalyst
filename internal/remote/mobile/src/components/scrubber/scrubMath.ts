export const SCRUB = {
  hold: 260,
  slop: 10,
  maxChats: 40,
  step: 50,
  itemHeight: 28,
  deadZone: 14,
  fullSpeedAt: 110,
  maxSpeed: 6.5,
  settle: 14,
  armFraction: 0.16,
  armMin: 56,
  disarmRatio: 0.7,
  ticks: 9,
  tickMin: 4,
  tickMax: 12,
} as const

export const bell = (d: number, sigma: number) => Math.exp(-(d * d) / (2 * sigma * sigma))

export function driftSpeed(offset: number): number {
  const beyond = Math.abs(offset) - SCRUB.deadZone
  if (beyond <= 0) return 0
  const t = Math.min(1, beyond / (SCRUB.fullSpeedAt - SCRUB.deadZone))
  return Math.sign(offset) * SCRUB.maxSpeed * t * t
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
