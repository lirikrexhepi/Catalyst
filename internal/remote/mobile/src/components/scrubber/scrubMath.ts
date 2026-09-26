export const SCRUB = {
  step: 30,
  itemHeight: 22,
  ticks: 11,
  tickGap: 7,
  tickMin: 8,
  tickMax: 30,
  arc: 26,
  sigma: 1.7,
  select: 56,
  hold: 240,
  slop: 10,
  listLeft: 48,
  margin: 24,
  maxChats: 40,
} as const

export const bell = (d: number, sigma: number) => Math.exp(-(d * d) / (2 * sigma * sigma))

export interface Range {
  focus0: number
  count: number
  anchor: number
  top: number
  bottom: number
}

export function focusAt(range: Range, y: number): number {
  const { focus0, count, anchor, top, bottom } = range
  const dy = y - anchor
  const below = count - 1 - focus0
  const above = focus0
  const downGain = below > 0 ? Math.min(1, Math.max(bottom - anchor, SCRUB.step) / (below * SCRUB.step)) : 1
  const upGain = above > 0 ? Math.min(1, Math.max(anchor - top, SCRUB.step) / (above * SCRUB.step)) : 1
  const raw = focus0 + (dy >= 0 ? dy / (SCRUB.step * downGain) : dy / (SCRUB.step * upGain))
  return Math.min(count - 1, Math.max(0, raw))
}

export function itemPose(index: number, focus: number, fingerY: number, pull: number) {
  const d = index - focus
  const near = bell(d, 0.6)
  const x = SCRUB.arc * bell(d, SCRUB.sigma) + pull * near
  const y = fingerY + d * SCRUB.step - SCRUB.itemHeight / 2
  const fade = Math.min(1, Math.max(0, 1 - (Math.abs(d) - 5) / 2.5))
  const o = (0.38 + 0.62 * bell(d, 1.1)) * fade
  return { x, y, o }
}

export function tickLength(k: number, shift: number) {
  const center = (SCRUB.ticks - 1) / 2
  return SCRUB.tickMin + (SCRUB.tickMax - SCRUB.tickMin) * bell(k - center + shift, 1.8)
}
