import React, { useMemo, useState } from 'react'
import { Search, Settings, PenSquare, Workflow } from 'lucide-react'
import { prettyModel, relative } from '../format'
import { useStore } from '../store'
import SettingsSheet from './SettingsSheet'
import type { ThreadSummary } from '../types'

const DAY = 86_400_000

function bucket(at?: number): string {
  if (!at) return 'Older'
  const startOfToday = new Date().setHours(0, 0, 0, 0)
  if (at >= startOfToday) return 'Today'
  if (at >= startOfToday - DAY) return 'Yesterday'
  if (at >= startOfToday - 7 * DAY) return 'Previous 7 days'
  if (at >= startOfToday - 30 * DAY) return 'Previous 30 days'
  return 'Older'
}

function ChatRow({ t, current, go }: { t: ThreadSummary; current: boolean; go: (id: string) => void }) {
  const waiting = t.attention === 'approval' || t.attention === 'question'
  return (
    <button className="nav-chat" aria-current={current} onClick={() => go(t.threadId)}>
      <span className="t">
        {(waiting || t.busy) && <span className={`dot${t.busy && !waiting ? ' pulse' : ''}`} aria-hidden="true" />}
        <span>{t.title || 'Chat'}</span>
      </span>
      <span className={`m${waiting ? ' accent' : ''}`}>
        {waiting
          ? t.attention === 'approval'
            ? 'Needs your approval'
            : 'Asked you a question'
          : [t.busy ? 'Working' : null, prettyModel(t.model), t.projectName, relative(t.lastActivity)].filter(Boolean).join(' · ')}
      </span>
    </button>
  )
}

export default function Drawer({ current, go }: { current: string | null; go: (id: string | null) => void }) {
  const summaries = useStore((s) => s.summaries)
  const loaded = useStore((s) => s.summariesLoaded)
  const connection = useStore((s) => s.connection)
  const [query, setQuery] = useState('')
  const [settings, setSettings] = useState(false)

  const coordinator = summaries.find((t) => t.kind === 'coordinator')
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const chats = summaries.filter(
      (t) =>
        t.kind !== 'coordinator' &&
        (!q || `${t.title} ${t.projectName ?? ''} ${t.model}`.toLowerCase().includes(q)),
    )
    const active = chats.filter((t) => t.busy || t.attention)
    const rest = chats.filter((t) => !(t.busy || t.attention))
    const out: Array<[string, ThreadSummary[]]> = []
    if (active.length) out.push(['Active', active])
    for (const t of rest) {
      const name = bucket(t.lastActivity)
      const last = out[out.length - 1]
      if (last && last[0] === name) last[1].push(t)
      else out.push([name, [t]])
    }
    return out
  }, [summaries, query])

  return (
    <>
      <div className="drawer-head">
        <h1>Composer</h1>
        {connection !== 'live' && <span className="when">{connection === 'offline' ? 'Offline' : 'Connecting'}</span>}
      </div>
      <label className="search">
        <Search size={17} aria-hidden="true" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search chats" />
      </label>
      <div className="nav">
        <button className="nav-item" aria-current={current === null} onClick={() => go(null)}>
          <PenSquare size={21} aria-hidden="true" />
          <span className="grow">New chat</span>
        </button>
        <button className="nav-item" aria-current={current === 'coordinator'} onClick={() => go('coordinator')}>
          <Workflow size={21} aria-hidden="true" />
          <span className="grow">Orchestrator</span>
          {coordinator?.busy && <span className="dot pulse" aria-label="Working" />}
        </button>

        {groups.map(([name, rows]) => (
          <section key={name}>
            <div className="nav-h">{name}</div>
            {rows.map((t) => (
              <ChatRow key={t.threadId} t={t} current={current === t.threadId} go={go} />
            ))}
          </section>
        ))}
        {loaded && groups.length === 0 && (
          <div className="empty" style={{ padding: '28px 20px', textAlign: 'left' }}>
            {query ? 'No chats match.' : 'No chats yet. Start one and it shows up here.'}
          </div>
        )}
      </div>
      <div className="drawer-foot">
        <button className="pill-accent" onClick={() => go(null)}>
          <PenSquare size={19} aria-hidden="true" /> Chat
        </button>
        <button className="circle" onClick={() => setSettings(true)} aria-label="Settings">
          <Settings size={20} aria-hidden="true" />
        </button>
      </div>
      {settings && <SettingsSheet onClose={() => setSettings(false)} />}
    </>
  )
}
