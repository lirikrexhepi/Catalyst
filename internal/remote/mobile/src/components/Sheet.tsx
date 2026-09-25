import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface SheetProps {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  headerAction?: React.ReactNode
}

/**
 * iOS-style sheet. Rendered in a portal so a transformed parent (the pushed
 * chat) cannot trap it. The grabber area drags the sheet with the finger and a
 * flick or a long pull dismisses it.
 */
export default function Sheet({ title, onClose, children, footer, className = '', headerAction }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; t: number; v: number; dy: number } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    ref.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const move = (dy: number, settle: boolean) => {
    const el = ref.current
    if (!el) return
    el.classList.toggle('settle', settle)
    el.style.transform = dy ? `translateY(${dy}px)` : ''
  }
  const onDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, t: e.timeStamp, v: 0, dy: 0 }
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const raw = e.clientY - d.y
    const dy = raw < 0 ? raw / 5 : raw
    d.v = (dy - d.dy) / Math.max(1, e.timeStamp - d.t)
    d.t = e.timeStamp
    d.dy = dy
    move(dy, false)
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    const height = ref.current?.offsetHeight ?? 400
    if (d.dy + d.v * 200 > height * 0.35) {
      move(height, true)
      window.setTimeout(onClose, 260)
    } else {
      move(0, true)
    }
  }

  return createPortal(
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className={`sheet ${className}`.trim()} role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} style={{ touchAction: 'none' }}>
          <div className="sheet-grab" aria-hidden="true" />
          <div className="sheet-head">
            <h2>{title}</h2>
            {headerAction}
          </div>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </>,
    document.body,
  )
}
