import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { ThreadSummary } from '../../types'
import { capture, prefersReducedMotion } from '../../ui'
import { hapticTick } from '../../platform/haptics'
import { useHiddenChats } from '../../hiddenChats'
import { SCRUB, driftSpeed, slotPose, tickLength } from './scrubMath'

interface HistoryScrubberProps {
  chats: ThreadSummary[]
  currentId?: string | null
  onPick: (threadId: string) => void
}

interface Gesture {
  pointer: number
  x0: number
  y0: number
  x: number
  y: number
  frameTop: number
  timer: number
  active: boolean
  done: boolean
  focus: number
  center: number
  armed: boolean
  armness: number
  armDistance: number
  last: number
  raf: number
  rounded: number
  hapticDue: boolean
}

interface Session {
  chats: ThreadSummary[]
  focus0: number
}

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const VISIBLE_RANGE = 2.8

function recent(chats: ThreadSummary[], hidden: ReadonlySet<string>): ThreadSummary[] {
  return chats
    .filter((c) => c.kind !== 'coordinator' && !hidden.has(c.threadId))
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
  const items = useRef<(HTMLDivElement | null)[]>([])
  const shown = useRef<boolean[]>([])
  const gesture = useRef<Gesture | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const sessionRef = useRef<Session | null>(null)
  sessionRef.current = session
  const hidden = useHiddenChats()
  const latest = useRef({ chats, currentId, onPick, hidden })
  latest.current = { chats, currentId, onPick, hidden }

  const render = useCallback(() => {
    const g = gesture.current
    const s = sessionRef.current
    if (!g || !s) return
    items.current.forEach((el, i) => {
      if (!el) return
      const d = i - g.focus
      const visible = Math.abs(d) < VISIBLE_RANGE
      if (shown.current[i] !== visible) {
        shown.current[i] = visible
        el.style.visibility = visible ? 'visible' : 'hidden'
      }
      if (!visible) return
      const pose = slotPose(d, g.armness)
      const pull = Math.abs(d) < 0.5 ? Math.min(Math.max(0, g.x - g.x0), g.armDistance) * 0.22 : 0
      el.style.transform = `translate3d(${pose.x + pull}px, ${g.center + pose.y - SCRUB.itemHeight / 2}px, 0) scale(${pose.scale})`
      el.style.opacity = String(pose.opacity)
      el.classList.toggle('armed', g.armed && Math.abs(d) < 0.5)
    })
  }, [])

  const tick = useCallback(
    (now: number) => {
      const g = gesture.current
      const s = sessionRef.current
      if (!g || !s || !g.active || g.done) return
      const dt = Math.min(0.05, (now - g.last) / 1000)
      g.last = now
      const speed = g.armed ? 0 : driftSpeed(g.y - g.y0)
      const max = s.chats.length - 1
      if (speed !== 0) {
        g.focus = Math.min(max, Math.max(0, g.focus + speed * dt))
      } else {
        const target = Math.round(g.focus)
        g.focus += (target - g.focus) * (1 - Math.exp(-dt * SCRUB.settle))
        if (Math.abs(target - g.focus) < 0.001) g.focus = target
      }
      g.armness += ((g.armed ? 1 : 0) - g.armness) * (1 - Math.exp(-dt * 16))
      const rounded = Math.round(g.focus)
      if (rounded !== g.rounded) {
        g.rounded = rounded
        g.hapticDue = true
      }
      render()
      g.raf = requestAnimationFrame(tick)
    },
    [render],
  )

  const fadeAndClose = (ms: number, then?: () => void) => {
    const opts: KeyframeAnimationOptions = { duration: ms, easing: EASE, fill: 'forwards' }
    veil.current?.animate([{ opacity: 1 }, { opacity: 0 }], opts)
    list.current?.animate([{ opacity: 1 }, { opacity: 0 }], opts)
    window.setTimeout(() => {
      setSession(null)
      then?.()
    }, ms)
  }

  const stop = (g: Gesture) => {
    window.clearTimeout(g.timer)
    if (g.raf) cancelAnimationFrame(g.raf)
    g.raf = 0
  }

  const commit = (g: Gesture) => {
    const s = sessionRef.current
    const index = Math.round(g.focus)
    const picked = s?.chats[index]
    const el = items.current[index]
    if (el) {
      el.animate(
        [
          { transform: el.style.transform, opacity: el.style.opacity || '1' },
          { transform: `${el.style.transform} translateX(28px)`, opacity: 0 },
        ],
        { duration: 220, easing: EASE, fill: 'forwards' },
      )
    }
    fadeAndClose(220, () => {
      if (picked && picked.threadId !== latest.current.currentId) latest.current.onPick(picked.threadId)
    })
  }

  const activate = () => {
    const g = gesture.current
    const frameEl = zone.current?.closest('.chat-frame')
    if (!g || !frameEl) return
    const pool = recent(latest.current.chats, latest.current.hidden)
    if (pool.length === 0) {
      gesture.current = null
      return
    }
    const rect = frameEl.getBoundingClientRect()
    const top = cssPx(frameEl, '--head-h') + SCRUB.step * 2.3
    const bottom = rect.height - cssPx(frameEl, '--dock-h') - SCRUB.step * 2.3
    const found = pool.findIndex((c) => c.threadId === latest.current.currentId)
    g.focus = Math.max(0, found)
    g.rounded = Math.round(g.focus)
    g.center = Math.min(Math.max(g.y0, top), Math.max(top, bottom))
    g.armDistance = Math.max(SCRUB.armMin, window.innerWidth * SCRUB.armFraction)
    g.active = true
    zone.current?.classList.add('active')
    setSession({ chats: pool, focus0: g.focus })
  }

  useLayoutEffect(() => {
    const g = gesture.current
    if (!session || !g) return
    shown.current = []
    render()
    const calm = prefersReducedMotion()
    veil.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: EASE })
    list.current?.animate(
      [
        { opacity: 0, transform: calm ? 'none' : 'translateX(-10px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 260, easing: EASE },
    )
    g.last = performance.now()
    g.raf = requestAnimationFrame(tick)
  }, [session, render, tick])

  useEffect(
    () => () => {
      const g = gesture.current
      if (g) stop(g)
    },
    [],
  )

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    if (gesture.current || !e.isPrimary) return
    const frameEl = zone.current?.closest('.chat-frame')
    const top = frameEl ? frameEl.getBoundingClientRect().top : 0
    capture(e.currentTarget, e.pointerId)
    gesture.current = {
      pointer: e.pointerId,
      x0: e.clientX,
      y0: e.clientY - top,
      x: e.clientX,
      y: e.clientY - top,
      frameTop: top,
      timer: window.setTimeout(activate, SCRUB.hold),
      active: false,
      done: false,
      focus: 0,
      center: 0,
      armed: false,
      armness: 0,
      armDistance: SCRUB.armMin,
      last: 0,
      raf: 0,
      rounded: 0,
      hapticDue: false,
    }
  }

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g || e.pointerId !== g.pointer || g.done) return
    const y = e.clientY - g.frameTop
    if (!g.active) {
      if (Math.hypot(e.clientX - g.x0, y - g.y0) > SCRUB.slop) {
        stop(g)
        gesture.current = null
      }
      return
    }
    g.x = e.clientX
    g.y = y
    const dx = g.x - g.x0
    const wasArmed = g.armed
    if (!g.armed && dx >= g.armDistance) g.armed = true
    else if (g.armed && dx < g.armDistance * SCRUB.disarmRatio) g.armed = false
    if (g.armed !== wasArmed || g.hapticDue) {
      g.hapticDue = false
      hapticTick()
    }
  }

  const onEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g || e.pointerId !== g.pointer) return
    stop(g)
    gesture.current = null
    zone.current?.classList.remove('active')
    if (!g.active || g.done) return
    g.done = true
    if (g.armed && e.type === 'pointerup') {
      hapticTick()
      commit(g)
    } else {
      fadeAndClose(180)
    }
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
                <span className="scrub-label">{c.title || c.preview || 'Untitled chat'}</span>
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
          <span key={k} className="scrub-tick" style={{ width: tickLength(k, false) }} />
        ))}
      </div>
    </>
  )
}
