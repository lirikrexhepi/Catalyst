import { useState } from 'react'
import { Activity } from 'lucide-react'
import { SheetList, SheetNote, SheetRow } from '../../components/sheet'
import { buildStamp } from '../../buildInfo'
import { AppearanceSection } from './AppearanceSection'
import { NotificationSettings } from './NotificationSettings'
import { MonitorsSection } from './MonitorsSection'
import { ConnectionSummary, LogsPage } from './LogsSection'
import { PcSection } from './PcSection'
import { PcStatsPage } from './PcStatsPage'
import { Section, SubPage } from './SubPage'

export function SettingsPage({ onClose }: { onClose: () => void }) {
  const [logs, setLogs] = useState(false)
  const [stats, setStats] = useState(false)

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
        <Section title="Performance">
          <SheetList>
            <SheetRow
              icon={Activity}
              label="CPU & RAM telemetry"
              chevron
              onClick={() => setStats(true)}
            />
          </SheetList>
        </Section>
        <Section title="Connection">
          <ConnectionSummary onOpen={() => setLogs(true)} />
        </Section>
        <Section title="This PC">
          <PcSection onOpenStats={() => setStats(true)} />
        </Section>
        <SheetNote>{buildStamp()}</SheetNote>
      </SubPage>
      {logs ? <LogsPage onClose={() => setLogs(false)} /> : null}
      {stats ? <PcStatsPage onClose={() => setStats(false)} /> : null}
    </>
  )
}
