import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { SPRINGS, VelocityTracker, capture, prefersReducedMotion, rubberband, springLinear, supportsLinearEasing } from '../../ui'

const EDGE = 24
const SLOP = 10
const STIR = 3
const HORIZONTAL_BIAS = 1.5
const LONG_PRESS_MS = 300
const COVER_LINGER_MS = 520
const PROJECTION_S = 0.16
const MAX_HANDOFF = 30
const CLOSE_SPRING = { damping: 1, response: SPRINGS.drawer.response }
const CAUGHT = 0.04
const EXCLUDED = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), .scrub-zone, .viewer, [data-no-drawer-swipe]'

interface Drag {
  id: number
  x0: number
  y0: number
  t0: number
  p0: number
  stirred: boolean
  started: boolean
  opening: boolean | null
  caught: boolean
}

function hasSelection(): boolean {
  const selection = document.getSelection()
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim())
}

export function useDrawer() {
  const shell = useRef<HTMLDivElement | null>(null)
  const [open, setOpenState] = useState(false)
  const [covered, setCovered] = useState(false)
  const openRef = useRef(false)
  const progress = useRef(0)
  const drag = useRef<Drag | null>(null)
  const tracker = useRef(new VelocityTracker())
  const coverTimer = useRef(0)

  const drawerWidth = () => shell.current?.querySelector<HTMLElement>('.drawer')?.offsetWidth || 300

  const paint = useCallback((p: number, settle: boolean) => {
    const el = shell.current
    if (!el) return
    progress.current = p
    el.classList.toggle('settle', settle)
    el.style.setProperty('--p', String(p))
  }, [])

  const handoff = useCallback((target: number, velocity?: number) => {
    const el = shell.current
    if (!el) return
    const distance = target - progress.current
    if (velocity === undefined || Math.abs(distance) < 0.001 || !supportsLinearEasing() || prefersReducedMotion()) {
      el.style.removeProperty('--ease-drawer')
      el.style.removeProperty('--ease-drawer-ms')
      return
    }
    const spring = target > 0 ? SPRINGS.drawer : CLOSE_SPRING
    const limit = target > 0 ? MAX_HANDOFF : (2 * Math.PI) / CLOSE_SPRING.response
    const relative = Math.max(-limit, Math.min(limit, velocity / distance))
    const { easing, ms } = springLinear(spring, 1.2, relative)
    el.style.setProperty('--ease-drawer', easing)
    el.style.setProperty('--ease-drawer-ms', `${ms}ms`)
  }, [])

  const visualProgress = () => {
    const main = shell.current?.querySelector<HTMLElement>('.main')
    if (!main) return progress.current
    const transform = getComputedStyle(main).transform
    if (!transform || transform === 'none') return 0
    return Math.max(-0.2, Math.min(1.2, new DOMMatrixReadOnly(transform).m41 / drawerWidth()))
  }

  const setOpen = useCallback(
    (next: boolean, velocity?: number) => {
      openRef.current = next
      setOpenState(next)
      handoff(next ? 1 : 0, velocity)
      paint(next ? 1 : 0, true)
      window.clearTimeout(coverTimer.current)
      if (next) {
        setCovered(true)
        const focused = document.activeElement
        if (focused instanceof HTMLElement) focused.blur()
      } else {
        coverTimer.current = window.setTimeout(() => setCovered(false), COVER_LINGER_MS)
      }
    },
    [paint, handoff],
  )

  const resume = useCallback(() => {
    handoff(openRef.current ? 1 : 0)
    paint(openRef.current ? 1 : 0, true)
  }, [paint, handoff])

  useEffect(() => {
    paint(0, false)
    return () => window.clearTimeout(coverTimer.current)
  }, [paint])

  useEffect(() => {
    const el = shell.current
    if (!el) return
    const onTouchMove = (e: TouchEvent) => {
      const d = drag.current
      const touch = e.touches[0]
      if (!d || !touch || !e.cancelable) return
      if (d.started) {
        e.preventDefault()
        return
      }
      const dx = touch.clientX - d.x0
      const dy = touch.clientY - d.y0
      if (Math.abs(dx) >= STIR && Math.abs(dx) > Math.abs(dy) * HORIZONTAL_BIAS) e.preventDefault()
    }
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [])

  const swallowClick = () => {
    const el = shell.current
    if (!el) return
    const stop = (ev: Event) => {
      ev.preventDefault()
      ev.stopPropagation()
    }
    el.addEventListener('click', stop, { capture: true, once: true })
    window.setTimeout(() => el.removeEventListener('click', stop, { capture: true }), 350)
  }

  const abandon = (d: Drag) => {
    drag.current = null
    if (d.caught) resume()
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
    const el = shell.current
    const target = e.target
    if (!el || !(target instanceof Element) || !el.contains(target) || target.closest(EXCLUDED)) return
    const isOpen = openRef.current
    const visual = visualProgress()
    const caught = Math.abs(visual - (isOpen ? 1 : 0)) > CAUGHT
    if (!isOpen && !caught && (e.clientX - el.getBoundingClientRect().left > EDGE || hasSelection())) return
    if (caught) paint(visual, false)
    drag.current = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      t0: performance.now(),
      p0: visual,
      stirred: false,
      started: false,
      opening: caught ? null : !isOpen,
      caught,
    }
    tracker.current.reset(e.clientX, 0)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    const dx = e.clientX - d.x0
    const dy = e.clientY - d.y0
    tracker.current.push(e.clientX, 0)
    if (!d.started) {
      const distance = Math.hypot(dx, dy)
      if (!d.stirred && distance >= STIR) {
        d.stirred = true
        if (d.opening === true && performance.now() - d.t0 > LONG_PRESS_MS) {
          abandon(d)
          return
        }
      }
      if (distance < SLOP) return
      const horizontal = Math.abs(dx) > Math.abs(dy) * HORIZONTAL_BIAS
      const toward = d.opening === null || (d.opening ? dx > 0 : dx < 0)
      if (!horizontal || !toward || (d.opening === true && hasSelection())) {
        abandon(d)
        return
      }
      d.started = true
      if (!d.caught) d.p0 = visualProgress()
      capture(e.currentTarget, e.pointerId)
    }
    const raw = d.p0 + dx / drawerWidth()
    const p = raw < 0 ? -rubberband(-raw, 1) * 0.25 : raw > 1 ? 1 + rubberband(raw - 1, 1) * 0.25 : raw
    paint(p, false)
  }

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    drag.current = null
    if (!d.started) {
      if (d.caught) resume()
      return
    }
    swallowClick()
    const velocity = tracker.current.velocity().x / drawerWidth()
    setOpen(progress.current + velocity * PROJECTION_S > 0.5, velocity)
  }

  return {
    shell,
    open,
    covered,
    setOpen,
    handlers: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd },
  }
}
