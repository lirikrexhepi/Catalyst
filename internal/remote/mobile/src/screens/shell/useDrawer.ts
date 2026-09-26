import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { VelocityTracker, capture, rubberband } from '../../ui'

const EDGE = 20
const SLOP = 10
const HORIZONTAL_BIAS = 1.3
const COVER_LINGER_MS = 520
const PROJECTION_S = 0.16

interface Drag {
  id: number
  x0: number
  y0: number
  p0: number
  started: boolean
  opening: boolean
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

  const visualProgress = () => {
    const main = shell.current?.querySelector<HTMLElement>('.main')
    if (!main) return progress.current
    const transform = getComputedStyle(main).transform
    if (!transform || transform === 'none') return progress.current
    return Math.max(0, Math.min(1, new DOMMatrixReadOnly(transform).m41 / drawerWidth()))
  }

  const setOpen = useCallback(
    (next: boolean) => {
      openRef.current = next
      setOpenState(next)
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
    [paint],
  )

  useEffect(() => {
    paint(0, false)
    return () => window.clearTimeout(coverTimer.current)
  }, [paint])

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

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
    const isOpen = openRef.current
    if (!isOpen && e.clientX > EDGE) return
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, p0: 0, started: false, opening: !isOpen }
    tracker.current.reset(e.clientX, 0)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    const dx = e.clientX - d.x0
    const dy = e.clientY - d.y0
    if (!d.started) {
      if (Math.hypot(dx, dy) < SLOP) return
      const horizontal = Math.abs(dx) > Math.abs(dy) * HORIZONTAL_BIAS
      const towardChange = d.opening ? dx > 0 : dx < 0
      if (!horizontal || !towardChange) {
        drag.current = null
        return
      }
      d.started = true
      d.p0 = visualProgress()
      paint(d.p0, false)
      capture(e.currentTarget, e.pointerId)
    }
    tracker.current.push(e.clientX, 0)
    const raw = d.p0 + dx / drawerWidth()
    const p = raw < 0 ? -rubberband(-raw, 1) * 0.25 : raw > 1 ? 1 + rubberband(raw - 1, 1) * 0.25 : raw
    paint(p, false)
  }

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    drag.current = null
    if (!d.started) return
    swallowClick()
    const velocity = tracker.current.velocity().x / drawerWidth()
    setOpen(progress.current + velocity * PROJECTION_S > 0.5)
  }

  return {
    shell,
    open,
    covered,
    setOpen,
    handlers: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd },
  }
}
