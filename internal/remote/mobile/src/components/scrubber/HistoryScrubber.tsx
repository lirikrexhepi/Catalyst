import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { ThreadSummary } from '../../types'
import { capture, prefersReducedMotion, rubberband } from '../../ui'
import { hapticTick } from '../../platform/haptics'
import { SCRUB, focusAt, itemPose, tickLength, type Range } from './scrubMath'

interface HistoryScrubberProps {
  chats: ThreadSummary[]
  currentId?: string | null
  onPick: (threadId: string) => void
}

interface Gesture {
  pointer: number
  x0: number
  y: number
  x: number
  frameTop: number
  timer: number
  active: boolean
  done: boolean
  range: Range | null
  focus: number
  rounded: number
  frame: number
}

interface Session {
  chats: ThreadSummary[]
  focus0: number
}

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

function recent(chats: ThreadSummary[]): ThreadSummary[] {
  return chats
    .slice()
    .sort((a, b) => (b.lastActivity ?? 0) - (a.lastActivity ?? 0))
    .slice(0, SCRUB.maxChats)
}

function cssPx(el: Element, name: string): number {
  return parseFloat(getComputedStyle(el).getPropertyValue(name)) || 0
}

export function HistoryScrubber({ chats, currentId, onPick }: HistoryScrubberProps) {
  const zone = useRef<HTMLDivElement | null>(null)
  const veil = useRef<HTMLDivElement | null>(null)
  const list = useRef<HTMLDivElement | null>(null)
  const ticks = useRef<(HTMLSpanElement | null)[]>([])
  const items = useRef<(HTMLDivElement | null)[]>([])
  const gesture = useRef<Gesture | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const latest = useRef({ chats, currentId, onPick })
  latest.current = { chats, currentId, onPick }

  const paintTicks = useCallback((shift: number) => {
    ticks.current.forEach((el, k) => {
      if (el) el.style.transform = `scaleX(${tickLength(k, shift) / SCRUB.tickMax})`
    })
  }, [])

  const paint = useCallback(() => {
    const g = gesture.current
    if (!g) return
    g.frame = 0
    if (!g.active || g.done || !g.range) return
    const focus = focusAt(g.range, g.y)
    const dx = Math.max(0, g.x - g.x0)
    const pull = rubberband(dx, SCRUB.select * 2)
    g.focus = focus
    items.current.forEach((el, i) => {
      if (!el) return
      const pose = itemPose(i, focus, g.y, pull)
      el.style.transform = `translate3d(${pose.x}px, ${pose.y}px, 0)`
      el.style.opacity = String(pose.o)
    })
    paintTicks(focus - Math.round(focus))
    const rounded = Math.round(focus)
    if (rounded !== g.rounded) {
      g.rounded = rounded
      hapticTick()
    }
    if (dx > SCRUB.select) commit(rounded)
  }, [paintTicks])

  const schedule = useCallback(() => {
    const g = gesture.current
    if (g && !g.frame) g.frame = requestAnimationFrame(paint)
  }, [paint])

  const fadeOut = (el: HTMLElement | null, ms: number, extra?: string) => {
    if (!el) return
    el.animate([{ opacity: getComputedStyle(el).opacity, transform: el.style.transform || 'none' }, { opacity: 0, transform: extra ?? (el.style.transform || 'none') }], {
      duration: ms,
      easing: EASE,
      fill: 'forwards',
    })
  }

  const finish = (ms: number, then?: () => void) => {
    fadeOut(veil.current, ms)
    fadeOut(list.current, ms)
    paintTicks(0)
    window.setTimeout(() => {
      setSession(null)
      then?.()
    }, ms)
  }

  const commit = (index: number) => {
    const g = gesture.current
    if (!g || g.done) return
    g.done = true
    const picked = sessionRef.current?.chats[index]
    const el = items.current[index]
    if (el) {
      const match = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(el.style.transform)
      const x = match ? parseFloat(match[1]) : 0
      const y = match ? parseFloat(match[2]) : 0
      fadeOut(el, 200, `translate3d(${x + 36}px, ${y}px, 0)`)
    }
    finish(200, () => {
      if (picked && picked.threadId !== latest.current.currentId) latest.current.onPick(picked.threadId)
    })
  }

  const sessionRef = useRef<Session | null>(null)
  sessionRef.current = session

  const activate = () => {
    const g = gesture.current
    const frameEl = zone.current?.closest('.chat-frame')
    if (!g || !frameEl) return
    const pool = recent(latest.current.chats)
    if (pool.length === 0) {
      gesture.current = null
      return
    }
    const rect = frameEl.getBoundingClientRect()
    const head = cssPx(frameEl, '--head-h')
    const dock = cssPx(frameEl, '--dock-h')
    const found = pool.findIndex((c) => c.threadId === latest.current.currentId)
    const focus0 = Math.max(0, found)
    const anchor = g.y
    g.frameTop = rect.top
    g.active = true
    g.focus = focus0
    g.rounded = focus0
    g.range = {
      focus0,
      count: pool.length,
      anchor,
      top: head + SCRUB.margin,
      bottom: rect.height - dock - SCRUB.margin,
    }
    hapticTick()
    setSession({ chats: pool, focus0 })
  }

  useLayoutEffect(() => {
    if (!session) return
    paint()
    const calm = prefersReducedMotion()
    veil.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: EASE })
    list.current?.animate(
      [
        { opacity: 0, transform: calm ? 'none' : 'translateX(-12px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 260, easing: EASE },
    )
  }, [session, paint])

  useEffect(() => {
    paintTicks(0)
    return () => {
      const g = gesture.current
      if (g) {
        window.clearTimeout(g.timer)
        if (g.frame) cancelAnimationFrame(g.frame)
      }
    }
  }, [paintTicks])

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    if (gesture.current || !e.isPrimary) return
    const frameEl = zone.current?.closest('.chat-frame')
    const top = frameEl ? frameEl.getBoundingClientRect().top : 0
    capture(e.currentTarget, e.pointerId)
    gesture.current = {
      pointer: e.pointerId,
      x0: e.clientX,
      x: e.clientX,
      y: e.clientY - top,
      frameTop: top,
      timer: window.setTimeout(activate, SCRUB.hold),
      active: false,
      done: false,
      range: null,
      focus: 0,
      rounded: 0,
      frame: 0,
    }
  }

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g || e.pointerId !== g.pointer) return
    const y = e.clientY - g.frameTop
    if (!g.active) {
      if (Math.hypot(e.clientX - g.x0, y - g.y) > SCRUB.slop) {
        window.clearTimeout(g.timer)
        gesture.current = null
      }
      return
    }
    g.x = e.clientX
    g.y = y
    schedule()
  }

  const onEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g || e.pointerId !== g.pointer) return
    window.clearTimeout(g.timer)
    if (g.frame) cancelAnimationFrame(g.frame)
    gesture.current = null
    if (g.active && !g.done) finish(180)
  }

  return (
    <>
      {session ? (
        <>
          <div ref={veil} className="scrub-veil" aria-hidden />
          <div ref={list} className="scrub-list" role="listbox" aria-label="Recent chats">
            {session.chats.map((c, i) => (
              <div
                key={c.threadId}
                ref={(el) => {
                  items.current[i] = el
                }}
                role="option"
                aria-selected={c.threadId === currentId}
                className="scrub-item"
              >
                {c.title || c.preview || 'Untitled chat'}
              </div>
            ))}
          </div>
        </>
      ) : null}
      <div
        ref={zone}
        className="scrub-zone"
        aria-label="Hold and slide to switch chats"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onEnd}
        onPointerCancel={onEnd}
        onContextMenu={(e) => e.preventDefault()}
      >
        {Array.from({ length: SCRUB.ticks }, (_, k) => (
          <span
            key={k}
            ref={(el) => {
              ticks.current[k] = el
            }}
            className="scrub-tick"
          />
        ))}
      </div>
    </>
  )
}
