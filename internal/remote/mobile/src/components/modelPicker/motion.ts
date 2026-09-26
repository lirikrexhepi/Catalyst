import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { SPRINGS, SpringDriver, prefersReducedMotion, type SpringSpec } from '../../ui'

type Pane = 'x' | 's' | 'o'

const PANE_IN: SpringSpec<Pane> = { x: SPRINGS.bouncy, s: SPRINGS.bouncy, o: { damping: 1, response: 0.24 } }
const PANE_OUT: SpringSpec<Pane> = { x: SPRINGS.snappy, s: SPRINGS.snappy, o: { damping: 1, response: 0.13 } }
const PANE_SHIFT = 12
const ENTER_DELAY = 80

const paneRender = (v: Record<Pane, number>) => ({
  transform: `translateX(${v.x}px) scale(${v.s})`,
  opacity: String(v.o),
})

const FADE_IN = { damping: 1, response: 0.24 }
const FADE_OUT = { damping: 1, response: 0.3 }

export const MORPH_OPEN = SPRINGS.bouncy
export const MORPH_CLOSE = { damping: 1, response: 0.3 }

export function useFade(root: RefObject<HTMLElement>) {
  const driver = useRef<SpringDriver<'o'> | null>(null)

  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const d = new SpringDriver<'o'>(el, { o: 0 }, (v) => ({ opacity: String(v.o) }))
    d.jump({ o: 0 })
    d.to({ o: 1 }, FADE_IN)
    driver.current = d
    return () => d.stop()
  }, [root])

  return useCallback((): number => driver.current?.to({ o: 0 }, FADE_OUT) ?? 0, [])
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
