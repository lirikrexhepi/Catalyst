import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, FolderGit2, MessageCirclePlus, Plus, Settings } from '../icons'
import { providerIcon } from '../components/providerIcons'
import { api } from '../api'
import AddProjectSheet from './AddProjectSheet'
import { useStore } from '../store'
import SettingsSheet from './SettingsSheet'
import { SettingsPage } from './settings/SettingsPage'
import type { Project, ThreadSummary } from '../types'
import { PROJECTS_CACHE_KEY, readLocal, writeLocal } from '../cache'
import { GlassPill } from '../ui'
import { BarButton, ICON_STROKE } from '../components/chrome/BarButton'
import { ChatRow } from './drawer/ChatRow'
import { ChatRowActions } from './drawer/ChatRowActions'
import { ProjectIcon } from '../components/ProjectIcon'
import { useHiddenChats } from '../hiddenChats'

const DAY = 86_400_000
const CLAUDE_OPEN_KEY = 'orchestrator_drawer_claude_open'

function bucket(at?: number): string {
  if (!at) return 'Older'
  const startOfToday = new Date().setHours(0, 0, 0, 0)
  if (at >= startOfToday) return 'Today'
  if (at >= startOfToday - DAY) return 'Yesterday'
  if (at >= startOfToday - 7 * DAY) return 'Last week'
  if (at >= startOfToday - 30 * DAY) return 'Last month'
  return 'Older'
}

interface DrawerProps {
  current: string | null
  project: string | null
  go: (id: string | null) => void
  openProject: (path: string) => void
}

export default function Drawer({ current, project, go, openProject }: DrawerProps) {
  const summaries = useStore((s) => s.summaries)
  const loaded = useStore((s) => s.summariesLoaded)
  const connection = useStore((s) => s.connection)
  const [settings, setSettings] = useState(false)
  const [allSettings, setAllSettings] = useState(false)
  const [projects, setProjects] = useState<Project[]>(() => readLocal<Project[]>(PROJECTS_CACHE_KEY, []))
  const [adding, setAdding] = useState(false)
  const [acting, setActing] = useState<ThreadSummary | null>(null)
  const hidden = useHiddenChats()

  const loadProjects = useCallback(() => {
    api
      .projects()
      .then((list) => {
        const next = Array.isArray(list) ? list : []
        writeLocal(PROJECTS_CACHE_KEY, next)
        setProjects(next)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    loadProjects()
    window.addEventListener('focus', loadProjects)
    return () => window.removeEventListener('focus', loadProjects)
  }, [loadProjects])

  const [claudeOpen, setClaudeOpen] = useState(() => readLocal<boolean>(CLAUDE_OPEN_KEY, true))
  const toggleClaude = () =>
    setClaudeOpen((open) => {
      writeLocal(CLAUDE_OPEN_KEY, !open)
      return !open
    })

  const claudeChats = useMemo(
    () =>
      summaries.filter((t) => t.source === 'claude-code' && t.kind !== 'coordinator' && !hidden.has(t.threadId) && !(t.busy || t.attention)),
    [summaries, hidden],
  )

  const groups = useMemo(() => {
    const chats = summaries.filter((t) => t.kind !== 'coordinator' && !hidden.has(t.threadId))
    const active = chats.filter((t) => t.busy || t.attention)
    const rest = chats.filter((t) => !(t.busy || t.attention) && t.source !== 'claude-code')
    const out: Array<[string, ThreadSummary[]]> = []
    if (active.length) out.push(['Active', active])
    for (const t of rest) {
      const name = bucket(t.lastActivity)
      const last = out[out.length - 1]
      if (last && last[0] === name) last[1].push(t)
      else out.push([name, [t]])
    }
    return out
  }, [summaries, hidden])

  return (
    <>
      <div className="dw-head">
        <h1>Orchestrator</h1>
        {connection !== 'live' ? <span className="dw-status">{connection === 'offline' ? 'Offline' : 'Connecting'}</span> : null}
      </div>
      <div className="dw-scroll">
        <section className="dw-section">
          <div className="dw-section-head">
            <span>Projects</span>
            <button className="dw-add" onClick={() => setAdding(true)} aria-label="Add project">
              <Plus size={22} strokeWidth={ICON_STROKE} aria-hidden />
            </button>
          </div>
          {projects.map((p) => (
            <button key={p.path} className="dw-project" aria-current={project === p.path} onClick={() => openProject(p.path)}>
              <ProjectIcon
                projectId={p.id}
                size={24}
                fallback={<FolderGit2 size={24} strokeWidth={ICON_STROKE} aria-hidden />}
              />
              <span className="dw-project-name">{p.name}</span>
              {p.runningAgents > 0 ? <span className="dot pulse" aria-label="Agents working" /> : null}
            </button>
          ))}
          {projects.length === 0 ? (
            <button className="dw-project muted" onClick={() => setAdding(true)}>
              <FolderGit2 size={24} strokeWidth={ICON_STROKE} aria-hidden />
              <span className="dw-project-name">Add a project folder</span>
            </button>
          ) : null}
        </section>

        {groups.map(([name, rows]) => (
          <section key={name} className="dw-section">
            <div className="dw-group">{name}</div>
            {rows.map((t) => (
              <ChatRow key={t.threadId} thread={t} current={current === t.threadId} onOpen={go} onActions={setActing} />
            ))}
          </section>
        ))}
        {claudeChats.length > 0 ? (
          <section className="dw-section">
            <button className="dw-group dw-group-toggle" onClick={toggleClaude} aria-expanded={claudeOpen}>
              <img src={providerIcon('claude-code')} alt="" className="dw-group-icon" />
              <span>Claude Code</span>
              <span className="dw-group-count">{claudeChats.length}</span>
              <ChevronRight size={18} strokeWidth={ICON_STROKE} className={claudeOpen ? 'dw-group-chev open' : 'dw-group-chev'} aria-hidden />
            </button>
            {claudeOpen
              ? claudeChats.map((t) => (
                  <ChatRow key={t.threadId} thread={t} current={current === t.threadId} onOpen={go} onActions={setActing} />
                ))
              : null}
          </section>
        ) : null}
        {loaded && groups.length === 0 && claudeChats.length === 0 ? <div className="dw-empty">No chats yet. Start one and it shows up here.</div> : null}
      </div>
      <div className="dw-foot">
        <GlassPill as="button" width={100} height={44} fill="#00417F" className="dw-new" onClick={() => go(null)}>
          <MessageCirclePlus size={24} strokeWidth={ICON_STROKE} aria-hidden />
          <span>Chat</span>
        </GlassPill>
        <BarButton icon={Settings} label="Settings" onClick={() => setSettings(true)} />
      </div>
      {settings ? <SettingsSheet onClose={() => setSettings(false)} onOpenAll={() => setAllSettings(true)} /> : null}
      {allSettings ? <SettingsPage onClose={() => setAllSettings(false)} /> : null}
      {acting ? (
        <ChatRowActions thread={acting} current={current === acting.threadId} onLeave={() => go(null)} onClose={() => setActing(null)} />
      ) : null}
      {adding ? (
        <AddProjectSheet
          onClose={() => setAdding(false)}
          onAdded={(p) => {
            setAdding(false)
            loadProjects()
            openProject(p.path)
          }}
        />
      ) : null}
    </>
  )
}
