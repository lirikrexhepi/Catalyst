import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { SPRINGS, SpringDriver, prefersReducedMotion, type SpringSpec } from '../../ui'

type Pop = 'sx' | 'sy' | 'y' | 'o'
type Pane = 'x' | 's' | 'o'

const HIDDEN: Record<Pop, number> = { sx: 0.95, sy: 0.92, y: 14, o: 0 }
const SHOWN: Record<Pop, number> = { sx: 1, sy: 1, y: 0, o: 1 }
const CLOSED: Record<Pop, number> = { sx: 0.96, sy: 0.94, y: 10, o: 0 }

const OPEN_SPRING: SpringSpec<Pop> = {
  sx: { damping: 0.9, response: 0.38 },
  sy: { damping: 0.82, response: 0.4 },
  y: { damping: 0.92, response: 0.38 },
  o: { damping: 1, response: 0.32 },
}
const CLOSE_SPRING: SpringSpec<Pop> = {
  sx: { damping: 1, response: 0.24 },
  sy: { damping: 1, response: 0.22 },
  y: { damping: 1, response: 0.24 },
  o: { damping: 1, response: 0.16 },
}
const PANE_IN: SpringSpec<Pane> = { x: SPRINGS.bouncy, s: SPRINGS.bouncy, o: { damping: 1, response: 0.24 } }
const PANE_OUT: SpringSpec<Pane> = { x: SPRINGS.snappy, s: SPRINGS.snappy, o: { damping: 1, response: 0.13 } }
const PANE_SHIFT = 12
const ENTER_DELAY = 80

const popRender = (v: Record<Pop, number>) => ({
  transform: `translateY(${v.y}px) scale(${v.sx}, ${v.sy})`,
  opacity: String(v.o),
})

const paneRender = (v: Record<Pane, number>) => ({
  transform: `translateX(${v.x}px) scale(${v.s})`,
  opacity: String(v.o),
})

export function usePopMotion(root: RefObject<HTMLElement>) {
  const driver = useRef<SpringDriver<Pop> | null>(null)
  const reduced = useRef(false)

  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    reduced.current = prefersReducedMotion()
    const start = reduced.current ? { ...SHOWN, o: 0 } : HIDDEN
    const d = new SpringDriver<Pop>(el, { ...start }, popRender)
    d.jump(start)
    d.to(SHOWN, reduced.current ? SPRINGS.snappy : OPEN_SPRING)
    driver.current = d
    return () => d.stop()
  }, [root])

  return useCallback((): number => {
    const d = driver.current
    if (!d) return 0
    return d.to(reduced.current ? { ...SHOWN, o: 0 } : CLOSED, reduced.current ? SPRINGS.snappy : CLOSE_SPRING)
  }, [])
}

export function usePaneSwap(first: RefObject<HTMLElement>, second: RefObject<HTMLElement>, showSecond: boolean) {
  const drivers = useRef<[SpringDriver<Pane>, SpringDriver<Pane>] | null>(null)
  const initial = useRef(showSecond)

  useLayoutEffect(() => {
    const a = first.current
    const b = second.current
    if (!a || !b) return
    const make = (el: HTMLElement, visible: boolean) => {
      const start = { x: 0, s: 1, o: visible ? 1 : 0 }
      const d = new SpringDriver<Pane>(el, start, paneRender)
      d.jump(start)
      return d
    }
    const pair: [SpringDriver<Pane>, SpringDriver<Pane>] = [make(a, !initial.current), make(b, initial.current)]
    drivers.current = pair
    return () => pair.forEach((d) => d.stop())
  }, [first, second])

  const previous = useRef(showSecond)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  useEffect(() => {
    const pair = drivers.current
    if (!pair || previous.current === showSecond) return
    previous.current = showSecond
    const [a, b] = pair
    const [leaving, entering] = showSecond ? [a, b] : [b, a]
    const dir = showSecond ? 1 : -1
    const calm = prefersReducedMotion()
    window.clearTimeout(timer.current)
    leaving.to({ x: calm ? 0 : -PANE_SHIFT * dir, s: calm ? 1 : 0.98, o: 0 }, PANE_OUT)
    entering.jump({ x: calm ? 0 : PANE_SHIFT * dir, s: calm ? 1 : 0.98, o: 0 })
    timer.current = window.setTimeout(() => entering.to({ x: 0, s: 1, o: 1 }, PANE_IN), ENTER_DELAY)
  }, [showSecond])
}
