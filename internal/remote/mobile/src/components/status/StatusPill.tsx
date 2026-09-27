import { useLayoutEffect, useRef, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { GlassPill, SpringDriver, prefersReducedMotion } from '../../ui'

interface StatusPillProps {
  icon: LucideIcon
  children: ReactNode
  action?: { label: string; onClick: () => void; busy?: boolean }
  placement?: 'top' | 'dock'
}

const ENTER = { damping: 0.86, response: 0.42 }

export function StatusPill({ icon: Icon, children, action, placement = 'top' }: StatusPillProps) {
  const pill = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    const el = pill.current
    if (!el) return
    const calm = prefersReducedMotion()
    const rise = placement === 'dock' ? 10 : -10
    const driver = new SpringDriver<'t'>(
      el,
      { t: 0 },
      (v) => ({ opacity: String(Math.min(1, v.t)), transform: calm ? 'none' : `translate3d(0, ${(1 - v.t) * rise}px, 0) scale(${0.94 + 0.06 * v.t})` }),
      0.001,
    )
    driver.jump({ t: 0 })
    driver.to({ t: 1 }, ENTER)
    return () => driver.stop()
  }, [placement])

  return (
    <div className={placement === 'dock' ? 'status-pill in-dock' : 'status-pill'} role="status" aria-live="polite">
      <GlassPill
        ref={pill}
        height={38}
        fill="var(--pill)"
        frost={14}
        pressable={false}
        className={action ? 'status-pill-body has-action' : 'status-pill-body'}
        style={{ opacity: 0 }}
      >
        <Icon size={16} strokeWidth={2} className={action?.busy ? 'spin' : undefined} aria-hidden />
        <span>{children}</span>
        {action ? (
          <button type="button" className="status-pill-action" disabled={action.busy} onClick={action.onClick}>
            {action.label}
          </button>
        ) : null}
      </GlassPill>
    </div>
  )
}
