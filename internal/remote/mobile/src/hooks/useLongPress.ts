import { useRef, type MouseEvent, type PointerEvent } from 'react'

const HOLD_MS = 450
const SLOP = 8

export function useLongPress(onLongPress: () => void) {
  const timer = useRef(0)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)

  const cancel = () => {
    window.clearTimeout(timer.current)
    origin.current = null
  }

  return {
    onPointerDown: (e: PointerEvent) => {
      if (!e.isPrimary) return
      fired.current = false
      origin.current = { x: e.clientX, y: e.clientY }
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        fired.current = true
        origin.current = null
        onLongPress()
      }, HOLD_MS)
    },
    onPointerMove: (e: PointerEvent) => {
      const o = origin.current
      if (o && Math.hypot(e.clientX - o.x, e.clientY - o.y) > SLOP) cancel()
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
    onClickCapture: (e: MouseEvent) => {
      if (!fired.current) return
      fired.current = false
      e.preventDefault()
      e.stopPropagation()
    },
  }
}
