import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft } from 'lucide-react'
import { BarButton } from '../../components/chrome/BarButton'
import { prefersReducedMotion } from '../../ui'
import { AppearanceSection } from './AppearanceSection'
import { NotificationSettings } from './NotificationSettings'
import { MonitorsSection } from './MonitorsSection'
import { LogsSection } from './LogsSection'
import { PcSection } from './PcSection'

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <span className="sheet-section">{title}</span>
      {children}
    </section>
  )
}

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const page = useRef<HTMLDivElement | null>(null)
  const closing = useRef(false)

  useLayoutEffect(() => {
    const shift = prefersReducedMotion() ? '0' : '100%'
    page.current?.animate([{ transform: `translate3d(${shift}, 0, 0)`, opacity: 0.6 }, { transform: 'none', opacity: 1 }], {
      duration: 380,
      easing: EASE,
    })
  }, [])

  const back = () => {
    const el = page.current
    if (!el || closing.current) return
    closing.current = true
    const shift = prefersReducedMotion() ? '0' : '100%'
    const a = el.animate([{ transform: 'none', opacity: 1 }, { transform: `translate3d(${shift}, 0, 0)`, opacity: 0.6 }], {
      duration: 300,
      easing: EASE,
      fill: 'forwards',
    })
    a.onfinish = onClose
  }

  return createPortal(
    <div ref={page} className="settings-page" role="dialog" aria-modal="true" aria-label="Settings">
      <header className="settings-head">
        <BarButton icon={ChevronLeft} label="Back" onClick={back} />
        <h1>Settings</h1>
      </header>
      <div className="settings-body">
        <Section title="Appearance">
          <AppearanceSection />
        </Section>
        <Section title="Notifications">
          <NotificationSettings />
        </Section>
        <Section title="Monitors">
          <MonitorsSection />
        </Section>
        <Section title="Connection">
          <LogsSection />
        </Section>
        <Section title="This PC">
          <PcSection />
        </Section>
      </div>
    </div>,
    document.body,
  )
}
