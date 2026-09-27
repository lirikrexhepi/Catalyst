import { useCallback, useEffect, useState } from 'react'
import { ClipboardCopy, ScrollText, Trash2 } from 'lucide-react'
import { SheetEmpty, SheetList, SheetRow } from '../../components/sheet'
import { api, getBase } from '../../api'
import { message, useStore } from '../../store'
import { clearConnectionLog, useConnectionLog } from '../../connectionLog'
import type { PcDiagnostics } from '../../types'
import { Section, SubPage } from './SubPage'

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

function pcProblems(d: PcDiagnostics): string[] {
  const out: string[] = []
  if (d.tunnelError) out.push(d.tunnelError)
  if (d.connecting) out.push('The PC is still setting up its public link')
  if (!d.tailscale) out.push('Tailscale is not installed on the PC')
  if (!d.publicUrl && !d.connecting) out.push('The PC has no public link, so the phone only works on the same network')
  return out
}

function useDiagnostics() {
  const [pc, setPc] = useState<PcDiagnostics | null>(null)
  const [pcError, setPcError] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .diagnostics()
      .then((d) => {
        setPc(d)
        setPcError(null)
      })
      .catch((e) => setPcError(message(e)))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const problems = pc ? pcProblems(pc) : pcError ? [`Can't read the PC's logs: ${pcError}`] : []
  return { pc, pcError, problems }
}

export function ConnectionSummary({ onOpen }: { onOpen: () => void }) {
  const phone = useConnectionLog()
  const { problems } = useDiagnostics()
  const latest = phone[phone.length - 1]

  return (
    <SheetList>
      {problems.length ? (
        <div className="settings-log-line problem">
          <span className="settings-log-text">{problems[0]}</span>
        </div>
      ) : latest ? (
        <div className="settings-log-line">
          <span className="settings-log-time">{time(latest.at)}</span>
          <span className="settings-log-text">{latest.text}</span>
        </div>
      ) : (
        <div className="settings-log-line">
          <span className="settings-log-text">No connection problems recorded</span>
        </div>
      )}
      <SheetRow icon={ScrollText} label="Connection logs" detail={phone.length ? String(phone.length) : undefined} chevron onClick={onOpen} />
    </SheetList>
  )
}

export function LogsPage({ onClose }: { onClose: () => void }) {
  const phone = useConnectionLog()
  const connection = useStore((s) => s.connection)
  const { pc, pcError, problems } = useDiagnostics()
  const [copied, setCopied] = useState(false)
  const recent = [...phone].reverse()
  const pcLog = [...(pc?.log ?? [])].reverse()

  const report = () =>
    [
      'Orchestrator phone connection report',
      `Phone: ${connection}, gateway ${getBase() || window.location.origin}`,
      pc
        ? `PC: port ${pc.port}, ${pc.headless ? 'background mode' : 'window open'}, public link ${pc.publicUrl || 'none'}, tailscale ${pc.tailscale ? 'yes' : 'no'}, cloudflared ${pc.cloudflared ? 'yes' : 'no'}, phones connected ${pc.clients}`
        : `PC: unreachable (${pcError ?? 'unknown'})`,
      ...problems.map((p) => `Problem: ${p}`),
      '',
      'Phone log:',
      ...phone.map((e) => `${new Date(e.at).toISOString()} ${e.text}`),
      '',
      'PC warnings and errors:',
      ...(pc?.log ?? []),
    ].join('\n')

  const copy = () => {
    void navigator.clipboard
      .writeText(report())
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1600)
      })
      .catch(() => undefined)
  }

  return (
    <SubPage title="Connection logs" onClose={onClose}>
      {problems.length ? (
        <Section title="Problems">
          <SheetList>
            {problems.map((p) => (
              <div key={p} className="settings-log-line problem">
                <span className="settings-log-text">{p}</span>
              </div>
            ))}
          </SheetList>
        </Section>
      ) : null}
      <Section title="This phone">
        <SheetList>
          {recent.length === 0 ? <SheetEmpty>No connection problems recorded</SheetEmpty> : null}
          {recent.map((e, i) => (
            <div key={`${e.at}-${i}`} className="settings-log-line">
              <span className="settings-log-time">{time(e.at)}</span>
              <span className="settings-log-text">{e.text}</span>
            </div>
          ))}
        </SheetList>
      </Section>
      {pcLog.length ? (
        <Section title="PC warnings and errors">
          <SheetList>
            {pcLog.map((line, i) => (
              <div key={`${i}-${line}`} className="settings-log-line">
                <span className="settings-log-text">{line}</span>
              </div>
            ))}
          </SheetList>
        </Section>
      ) : null}
      <SheetList>
        <SheetRow icon={ClipboardCopy} label={copied ? 'Copied' : 'Copy report for an agent'} onClick={copy} />
        <SheetRow icon={Trash2} label="Clear phone log" disabled={phone.length === 0} onClick={clearConnectionLog} />
      </SheetList>
    </SubPage>
  )
}
