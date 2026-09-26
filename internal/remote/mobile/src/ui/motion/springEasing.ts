import { springAt, type SpringConfig } from './spring'

export function springLinear(config: SpringConfig, maxSeconds = 1.2): { easing: string; ms: number } {
  const step = 1 / 60
  const points: number[] = []
  let t = 0
  for (;;) {
    const s = springAt(0, 1, 0, config, t)
    points.push(s.value)
    if ((Math.abs(1 - s.value) < 0.001 && Math.abs(s.velocity) < 0.01) || t >= maxSeconds) break
    t += step
  }
  points[points.length - 1] = 1
  return { easing: `linear(${points.map((p) => Math.round(p * 10000) / 10000).join(', ')})`, ms: Math.round(t * 1000) }
}

export function installSpringEasing(name: string, config: SpringConfig) {
  if (typeof CSS === 'undefined' || !CSS.supports('transition-timing-function', 'linear(0, 1)')) return
  const { easing, ms } = springLinear(config)
  const root = document.documentElement
  root.style.setProperty(`--${name}`, easing)
  root.style.setProperty(`--${name}-ms`, `${ms}ms`)
}
