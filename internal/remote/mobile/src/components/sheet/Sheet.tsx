import { useCallback, useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { GlassSquircle, SpringDriver, VelocityTracker, capture, prefersReducedMotion, rubberband, type SpringConfig } from '../../ui'
import { SHEET } from './layout'

export type Dismiss = (then?: () => void) => void

type Slot = ReactNode | ((dismiss: Dismiss) => ReactNode)

interface SheetProps {
  title: string
  showTitle?: boolean
  onClose: () => void
  children: Slot
  footer?: Slot
  className?: string
}

type Channel = 'y'

const render = (slot: Slot | undefined, dismiss: Dismiss) => (typeof slot === 'function' ? slot(dismiss) : slot)

export function Sheet({ title, showTitle = true, onClose, children, footer, className = '' }: SheetProps) {
  const card = useRef<HTMLElement | null>(null)
  const scrim = useRef<HTMLDivElement | null>(null)
  const cardDriver = useRef<SpringDriver<Channel> | null>(null)
  const scrimDriver = useRef<SpringDriver<Channel> | null>(null)
  const distance = useRef(600)
  const closing = useRef(false)
  const drag = useRef<{ id: number; y0: number; from: number; y: number } | null>(null)
  const tracker = useRef(new VelocityTracker())
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  const move = useCallback((y: number, spring: SpringConfig, velocity = 0) => {
    const spec = prefersReducedMotion() ? SHEET.close : spring
    scrimDriver.current?.to({ y }, spec, { y: velocity })
    return cardDriver.current?.to({ y }, spec, { y: velocity }) ?? 0
  }, [])

  const jump = (y: number) => {
    scrimDriver.current?.jump({ y })
    cardDriver.current?.jump({ y })
  }

  const dismiss = useCallback<Dismiss>(
    (then) => {
      if (closing.current) return
      closing.current = true
      const ms = move(distance.current, SHEET.close)
      window.setTimeout(() => {
        then?.()
        closeRef.current()
      }, ms)
    },
    [move],
  )

  useLayoutEffect(() => {
    const el = card.current
    const veil = scrim.current
    if (!el || !veil) return
    distance.current = Math.max(200, window.innerHeight - el.getBoundingClientRect().top)
    const d = distance.current
    cardDriver.current = new SpringDriver<Channel>(el, { y: d }, (v) => ({ transform: `translate3d(0, ${v.y}px, 0)` }), SHEET.settlePx)
    scrimDriver.current = new SpringDriver<Channel>(veil, { y: d }, (v) => ({ opacity: String(Math.min(1, Math.max(0, 1 - v.y / d))) }), SHEET.settlePx)
    jump(d)
    move(0, SHEET.open)
    return () => {
      cardDriver.current?.stop()
      scrimDriver.current?.stop()
    }
  }, [move])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKey)
    card.current?.focus({ preventScroll: true })
    return () => window.removeEventListener('keydown', onKey)
  }, [dismiss])

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (closing.current || !e.isPrimary) return
    capture(e.currentTarget, e.pointerId)
    const from = cardDriver.current?.state().value.y ?? 0
    drag.current = { id: e.pointerId, y0: e.clientY, from, y: from }
    tracker.current.reset(0, e.clientY)
    jump(from)
  }

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    tracker.current.push(0, e.clientY)
    const raw = d.from + e.clientY - d.y0
    d.y = raw >= 0 ? raw : rubberband(raw, distance.current)
    jump(d.y)
  }

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || e.pointerId !== d.id) return
    drag.current = null
    const velocity = tracker.current.velocity().y
    const height = card.current?.offsetHeight ?? distance.current
    if (d.y + velocity * SHEET.projection > height * SHEET.dismissRatio) {
      closing.current = true
      const ms = move(distance.current, SHEET.close, Math.max(0, velocity))
      window.setTimeout(() => closeRef.current(), ms)
    } else {
      move(0, SHEET.open, velocity)
    }
  }

  return createPortal(
    <>
      <div ref={scrim} className="gsheet-scrim" onClick={() => dismiss()} aria-hidden />
      <GlassSquircle
        ref={card}
        as="section"
        radius={SHEET.radius}
        fill={SHEET.fill}
        pressable={false}
        className={`gsheet ${className}`.trim()}
        style={{ position: 'fixed' }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="gsheet-grip" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          {showTitle ? <span className="gsheet-title">{title}</span> : null}
        </div>
        <div className="gsheet-body">{render(children, dismiss)}</div>
        {footer ? <div className="gsheet-foot">{render(footer, dismiss)}</div> : null}
      </GlassSquircle>
    </>,
    document.body,
  )
}
