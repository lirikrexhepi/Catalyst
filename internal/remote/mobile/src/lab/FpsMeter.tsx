import { useEffect, useRef } from 'react'

export function FpsMeter() {
  const out = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let windowStart = last
    let frames = 0
    let worst = 0
    const tick = (now: number) => {
      const dt = now - last
      last = now
      frames++
      worst = Math.max(worst, dt)
      if (now - windowStart >= 500) {
        const fps = Math.round((frames * 1000) / (now - windowStart))
        if (out.current) {
          out.current.textContent = `${fps} fps · worst ${worst.toFixed(1)} ms`
          out.current.dataset.state = worst > 34 ? 'bad' : worst > 20 ? 'warn' : 'ok'
        }
        frames = 0
        worst = 0
        windowStart = now
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <div ref={out} className="fps" data-state="ok" />
}
