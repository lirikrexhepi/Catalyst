import React, { useMemo, useState } from 'react'
import { ChevronRight, MoreHorizontal, Plus } from 'lucide-react'
import { useStore } from '../store'
import { choiceLabel, relative } from '../format'
import Elapsed from '../components/Elapsed'
import NewAgentSheet from './NewAgentSheet'
import SettingsSheet from './SettingsSheet'
import type { ThreadSummary } from '../types'

type Status = 'attention' | 'working' | 'failed' | 'idle'

function statusOf(t: ThreadSummary): Status {
  if (t.attention) return 'attention'
  if (t.busy) return 'working'
  if (t.state === 'failed') return 'failed'
  return 'idle'
}

/** Agents grouped by what they need from you: an answer, time, or nothing. */
export default function Inbox({ open }: { open: (threadId: string) => void }) {
  const summaries = useStore((s) => s.summaries)
  const loaded = useStore((s) => s.summariesLoaded)
  const connection = useStore((s) => s.connection)
  const providers = useStore((s) => s.providers)
  const [creating, setCreating] = useState(false)
  const [settings, setSettings] = useState(false)

  const coordinator = summaries.find((s) => s.kind === 'coordinator')
  const groups = useMemo(() => {
    const agents = summaries.filter((s) => s.kind === 'agent')
    return {
      attention: agents.filter((a) => statusOf(a) === 'attention'),
      working: agents.filter((a) => statusOf(a) === 'working'),
      rest: agents.filter((a) => statusOf(a) === 'idle' || statusOf(a) === 'failed'),
    }
  }, [summaries])

  const empty = loaded && groups.attention.length + groups.working.length + groups.rest.length === 0

  return (
    <div className="screen">
      <div className="scroll" style={{ paddingBottom: 'calc(var(--safe-bottom) + 96px)' }}>
        <div className="inbox-head">
          <h1 className="inbox-title">Agents</h1>
          <button className="icon-btn" onClick={() => setSettings(true)} aria-label="Connection and settings">
            <MoreHorizontal size={22} aria-hidden="true" />
          </button>
        </div>
        <div className="conn" role="status">
          <span className="conn-dot" data-state={connection} aria-hidden="true" />
          {connection === 'live' ? 'Connected to your PC' : connection === 'connecting' ? 'Connecting to your PC' : 'Offline, retrying'}
        </div>

        <button className="orchestrator-entry" onClick={() => open('coordinator')}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="who">Orchestrator</div>
            <div className="what">
              {coordinator?.busy
                ? 'Planning your request'
                : coordinator?.preview || 'Describe the work and it splits it across agents'}
            </div>
          </div>
          {coordinator?.busy ? <Elapsed since={coordinator.turnStartedAt} /> : <ChevronRight size={18} aria-hidden="true" />}
        </button>

        {groups.attention.length > 0 && (
          <Section title="Waiting on you" rows={groups.attention} open={open} providers={providers} />
        )}
        {groups.working.length > 0 && <Section title="Working" rows={groups.working} open={open} providers={providers} />}
        {groups.rest.length > 0 && <Section title="Recent" rows={groups.rest} open={open} providers={providers} />}

        {empty && (
          <div className="empty">
            <strong>No agents running</strong>
            Start one below, or ask the orchestrator to plan the work for you.
          </div>
        )}
      </div>

      <button className="fab" onClick={() => setCreating(true)}>
        <Plus size={20} aria-hidden="true" /> New agent
      </button>

      {creating && (
        <NewAgentSheet
          onClose={() => setCreating(false)}
          onStarted={(id) => {
            setCreating(false)
            open(id)
          }}
        />
      )}
      {settings && <SettingsSheet onClose={() => setSettings(false)} />}
    </div>
  )
}

function Section({
  title,
  rows,
  open,
  providers,
}: {
  title: string
  rows: ThreadSummary[]
  open: (id: string) => void
  providers: import('../types').ProviderInfo[]
}) {
  return (
    <section aria-label={title}>
      <h2 className="section-h">
        {title} <span className="n">{rows.length}</span>
      </h2>
      {rows.map((t) => (
        <Row key={t.threadId} t={t} open={open} providers={providers} />
      ))}
    </section>
  )
}

function Row({ t, open, providers }: { t: ThreadSummary; open: (id: string) => void; providers: import('../types').ProviderInfo[] }) {
  const status = statusOf(t)
  const where = [t.projectName, t.branch].filter(Boolean).join(' on ')
  const model = t.driver ? choiceLabel({ driver: t.driver, model: t.model, options: t.options }, providers) : ''
  const preview =
    status === 'attention'
      ? t.attention === 'question'
        ? 'Asked you a question'
        : 'Wants permission to continue'
      : t.preview
  return (
    <button className="row" data-status={status} onClick={() => open(t.threadId)}>
      <span className="filament" aria-hidden="true" />
      <span className="body">
        <span className="title" style={{ display: 'block' }}>{t.title}</span>
        <span className="meta" style={{ display: 'block' }}>
          {[model, where].filter(Boolean).join(', ')}
        </span>
        {preview && <span className={`preview${status === 'attention' ? ' call' : ''}`}>{preview}</span>}
      </span>
      <span className="side">
        {status === 'working' ? (
          <Elapsed since={t.turnStartedAt} />
        ) : (
          <span className="when">{relative(t.lastActivity)}</span>
        )}
        {status === 'failed' && <span className="when" style={{ color: 'var(--fault)' }}>failed</span>}
      </span>
    </button>
  )
}
