import { useState } from 'react'
import { AppearanceSection } from './AppearanceSection'
import { NotificationSettings } from './NotificationSettings'
import { MonitorsSection } from './MonitorsSection'
import { ConnectionSummary, LogsPage } from './LogsSection'
import { PcSection } from './PcSection'
import { Section, SubPage } from './SubPage'

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const [logs, setLogs] = useState(false)

  return (
    <>
      <SubPage title="Settings" onClose={onClose}>
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
          <ConnectionSummary onOpen={() => setLogs(true)} />
        </Section>
        <Section title="This PC">
          <PcSection />
        </Section>
      </SubPage>
      {logs ? <LogsPage onClose={() => setLogs(false)} /> : null}
    </>
  )
}
