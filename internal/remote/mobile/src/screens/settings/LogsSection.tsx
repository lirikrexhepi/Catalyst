import { useCallback, useEffect, useState } from 'react'
import { ClipboardCopy, Trash2 } from 'lucide-react'
import { SheetEmpty, SheetList, SheetRow } from '../../components/sheet'
import { api, getBase } from '../../api'
import { message, useStore } from '../../store'
import { clearConnectionLog, useConnectionLog } from '../../connectionLog'
import type { PcDiagnostics } from '../../types'

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

function pcProblems(d: PcDiagnostics): string[] {
  const out: string[] = []
  if (d.tunnelError) out.push(d.tunnelError)
  if (d.connecting) out.push('The PC is still setting up its public link')
  if (!d.tailscale) out.push('Tailscale is not installed on the PC')
  if (!d.publicUrl && !d.connecting) out.push('The PC has no public link, so the phone only works on the same network')
  return out
}

export function LogsSection() {
  const phone = useConnectionLog()
  const connection = useStore((s) => s.connection)
  const [pc, setPc] = useState<PcDiagnostics | null>(null)
  const [pcError, setPcError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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
  const recent = phone.slice(-8).reverse()

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
    <>
      {problems.length ? (
        <SheetList>
          {problems.map((p) => (
            <div key={p} className="settings-log-line problem">
              {p}
            </div>
          ))}
        </SheetList>
      ) : null}
      <SheetList scroll>
        {recent.length === 0 ? <SheetEmpty>No connection problems recorded</SheetEmpty> : null}
        {recent.map((e) => (
          <div key={`${e.at}-${e.text}`} className="settings-log-line">
            <span className="settings-log-time">{time(e.at)}</span>
            <span className="settings-log-text">{e.text}</span>
          </div>
        ))}
      </SheetList>
      <SheetList>
        <SheetRow icon={ClipboardCopy} label={copied ? 'Copied' : 'Copy report for an agent'} onClick={copy} />
        <SheetRow icon={Trash2} label="Clear phone log" disabled={phone.length === 0} onClick={clearConnectionLog} />
      </SheetList>
    </>
  )
}
