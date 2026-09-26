import { useLayoutEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { GlassPill, prefersReducedMotion } from '../../ui'
import { useStore } from '../../store'
import type { NavDirection } from '../../platform/historyDirection'

export interface Cue {
  key: number
  direction: Exclude<NavDirection, 'push'>
  threadId: string | null
  project: string | null
}

const EASE_IN = 'cubic-bezier(0.22, 1, 0.36, 1)'
const EASE_OUT = 'cubic-bezier(0.4, 0, 1, 1)'
const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() || path

export function NavCue({ cue }: { cue: Cue | null }) {
  const pill = useRef<HTMLElement | null>(null)
  const title = useStore((s) => {
    if (!cue) return ''
    if (cue.project) return baseName(cue.project)
    if (!cue.threadId) return 'New chat'
    return s.summaries.find((t) => t.threadId === cue.threadId)?.title || 'Chat'
  })

  useLayoutEffect(() => {
    const el = pill.current
    if (!el || !cue) return
    const shift = prefersReducedMotion() ? 0 : cue.direction === 'back' ? -12 : 12
    const animation = el.animate(
      [
        { opacity: 0, transform: `translate3d(${shift}px, 0, 0) scale(0.94)`, easing: EASE_IN },
        { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)', offset: 0.2 },
        { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)', offset: 0.78, easing: EASE_OUT },
        { opacity: 0, transform: 'translate3d(0, -4px, 0) scale(0.97)' },
      ],
      { duration: 1500, fill: 'forwards' },
    )
    return () => animation.cancel()
  }, [cue])

  if (!cue) return null
  const Icon = cue.direction === 'back' ? ChevronLeft : ChevronRight
  return (
    <div className="nav-cue" role="status" aria-live="polite">
      <GlassPill ref={pill} height={34} fill="rgba(65, 65, 65, 0.82)" frost={14} pressable={false} className="nav-cue-pill" style={{ opacity: 0 }}>
        <Icon size={16} strokeWidth={2} aria-hidden />
        <span>{title}</span>
      </GlassPill>
    </div>
  )
}
