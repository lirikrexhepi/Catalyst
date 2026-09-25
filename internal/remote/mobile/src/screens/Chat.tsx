import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDown, ChevronDown, Folder, Menu, MoreHorizontal, PenSquare, Play, Power, RotateCcw, ShieldCheck, Square, Workflow } from 'lucide-react'
import Feed from '../feed/Feed'
import Composer from '../components/Composer'
import Sheet from '../components/Sheet'
import ModelSheet from '../components/ModelSheet'
import Elapsed from '../components/Elapsed'
import { api } from '../api'
import { choiceLabel, defaultOptions } from '../format'
import { effectiveChoice, interrupt, loadProviders, loadThread, message, refreshSummaries, setChoice, useStore } from '../store'
import type { DevServer, ModelChoice, Project } from '../types'
import { PreviewLauncher, PreviewScreen } from './Preview'
import { providerIcon } from '../components/providerIcons'

interface ChatProps {
  threadId: string | null
  openDrawer: () => void
  go: (id: string | null) => void
}

export default function Chat(props: ChatProps) {
  return props.threadId ? <Conversation {...props} threadId={props.threadId} /> : <NewChat {...props} />
}

function TopBar({
  openDrawer,
  go,
  pill,
  icon,
  onPill,
  onMore,
  onPreview,
}: {
  openDrawer: () => void
  go: (id: string | null) => void
  pill: string
  icon?: string
  onPill: () => void
  onMore?: () => void
  onPreview?: () => void
}) {
  return (
    <header className="bar">
      <button className="circle" onClick={openDrawer} aria-label="Open chats">
        <Menu size={21} aria-hidden="true" />
      </button>
      <button className="title-pill" onClick={onPill} aria-label={`Model: ${pill}. Change`}>
        {icon && (
          <img
            src={icon}
            alt=""
            className="title-pill-icon"
            draggable={false}
          />
        )}
        <span>{pill}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      <span className="spacer" />
      {onPreview && (
        <button className="circle" onClick={onPreview} aria-label="Preview the site">
          <Play size={18} aria-hidden="true" />
        </button>
      )}
      {onMore && (
        <button className="circle" onClick={onMore} aria-label="Chat actions">
          <MoreHorizontal size={20} aria-hidden="true" />
        </button>
      )}
      <button className="circle" onClick={() => go(null)} aria-label="New chat">
        <PenSquare size={19} aria-hidden="true" />
      </button>
    </header>
  )
}

/* ------------------------------------------------------------------ */

function Conversation({ threadId, openDrawer, go }: ChatProps & { threadId: string }) {
  const summary = useStore((s) => s.summaries.find((t) => t.threadId === threadId))
  const thread = useStore((s) => s.threads[threadId])
  const providers = useStore((s) => s.providers)
  useStore((s) => s.choices[threadId])
  const choice = effectiveChoice(threadId)
  const [menu, setMenu] = useState(false)
  const [picking, setPicking] = useState(false)
  const [pinned, setPinned] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState<'pick' | DevServer | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const isCoordinator = threadId === 'coordinator'

  useEffect(() => {
    void loadThread(threadId)
    void loadProviders()
  }, [threadId])

  useLayoutEffect(() => {
    const el = scroller.current
    if (el && pinned) el.scrollTop = el.scrollHeight
  }, [thread?.blocks, thread?.busy, pinned])

  const onScroll = () => {
    const el = scroller.current
    if (el) setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
  }

  const busy = Boolean(thread?.busy)
  const title = isCoordinator ? 'Orchestrator' : summary?.title || 'Chat'

  const act = async (fn: () => Promise<unknown>) => {
    setMenu(false)
    setActionError(null)
    try {
      await fn()
      void refreshSummaries()
    } catch (e) {
      setActionError(message(e))
    }
  }

  return (
    <div className="screen">
      <TopBar
        openDrawer={openDrawer}
        go={go}
        pill={choiceLabel(choice, providers)}
        icon={choice?.driver ? providerIcon(choice.driver) : undefined}
        onPill={() => setPicking(true)}
        onMore={() => setMenu(true)}
        onPreview={() => setPreviewing('pick')}
      />
      <div className="chat-title">
        {title}
        {summary?.projectName ? ` · ${summary.projectName}` : ''}
      </div>

      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="scroll" ref={scroller} onScroll={onScroll}>
          {thread?.error && !thread.loaded && (
            <div className="empty">
              <strong>Couldn't load this chat</strong>
              {thread.error}
              <div style={{ marginTop: 14 }}>
                <button className="btn" onClick={() => void loadThread(threadId, true)}>
                  Try again
                </button>
              </div>
            </div>
          )}
          {!thread?.loaded && !thread?.error && <div className="empty">Loading…</div>}
          {thread?.loaded && thread.blocks.length === 0 && (
            <div className="empty">
              <strong>{isCoordinator ? 'Plan work across agents' : 'Nothing here yet'}</strong>
              {isCoordinator ? 'Describe the work. The orchestrator splits it up and starts agents.' : 'Send a message to continue.'}
            </div>
          )}
          {thread?.loaded && <Feed threadId={threadId} blocks={thread.blocks} turnMs={thread.turnMs} />}
          {busy && (
            <div className="feed" style={{ paddingTop: 0 }}>
              <div className="working" role="status">
                <span className="dot" aria-hidden="true" />
                <span className="shimmer">Working</span>
                <Elapsed since={thread?.turnStartedAt} />
              </div>
            </div>
          )}
          {actionError && (
            <div className="feed">
              <div className="say error">{actionError}</div>
            </div>
          )}
        </div>
        {!pinned && (
          <button
            className="jump"
            aria-label="Jump to latest"
            onClick={() => {
              const el = scroller.current
              if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
              setPinned(true)
            }}
          >
            <ArrowDown size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      <Composer threadId={threadId} placeholder={busy ? 'Queue a message' : isCoordinator ? 'Describe the work' : 'Message'} />

      {picking && <ModelSheet value={choice} onChange={(c) => setChoice(threadId, c)} onClose={() => setPicking(false)} />}
      {previewing === 'pick' && (
        <PreviewLauncher
          threadId={isCoordinator ? null : threadId}
          canAsk={Boolean(summary?.live)}
          onClose={() => setPreviewing(null)}
          onOpen={setPreviewing}
        />
      )}
      {previewing && previewing !== 'pick' && (
        <PreviewScreen port={previewing.port} name={previewing.name || 'Dev server'} onBack={() => setPreviewing(null)} />
      )}
      {menu && (
        <Sheet title={title} onClose={() => setMenu(false)}>
          <div className="list">
            <button disabled={!busy} onClick={() => void act(() => interrupt(threadId))}>
              <Square size={18} aria-hidden="true" /> Stop responding
            </button>
            {isCoordinator ? (
              <button onClick={() => void act(() => api.newConversation().then(() => loadThread(threadId, true)))}>
                <RotateCcw size={18} aria-hidden="true" /> Start over
              </button>
            ) : (
              <button
                style={{ color: 'var(--fault)' }}
                disabled={!summary?.live}
                onClick={() =>
                  void act(async () => {
                    await api.endAgent(threadId)
                  })
                }
              >
                <Power size={18} aria-hidden="true" /> End agent
              </button>
            )}
          </div>
        </Sheet>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

const LAST_KEY = 'orchestrator_new_agent'

function lastUsed(): { cwd?: string; choice?: ModelChoice; autoApprove?: boolean } {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

/** New chat: pick a project and model, and the first message starts the agent. */
function NewChat({ openDrawer, go }: ChatProps) {
  const providers = useStore((s) => s.providers)
  const providersLoaded = useStore((s) => s.providersLoaded)
  const providersLoading = useStore((s) => s.providersLoading)
  const remembered = useRef(lastUsed()).current
  const [projects, setProjects] = useState<Project[]>([])
  const [cwd, setCwd] = useState(remembered.cwd || '')
  const [choice, setLocalChoice] = useState<ModelChoice | undefined>(remembered.choice)
  const [autoApprove, setAutoApprove] = useState(remembered.autoApprove ?? true)
  const [sheet, setSheet] = useState<'model' | 'project' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadProviders()
    api
      .projects()
      .then((list) => {
        const all = Array.isArray(list) ? list : []
        setProjects(all)
        setCwd((cur) => (cur && all.some((p) => p.path === cur) ? cur : all[0]?.path || cur))
      })
      .catch((e) => setError(message(e)))
  }, [])

  // Drop a remembered model the desktop no longer offers.
  useEffect(() => {
    if (providers.length === 0) return
    const p = providers.find((x) => x.driver === choice?.driver)
    if (p && (choice?.model === '' ? p.models.length === 0 : p.models.some((m) => m.id === choice?.model))) return
    const first = providers[0]
    const m = first.models.find((x) => x.default) ?? first.models[0]
    if (m) setLocalChoice({ driver: first.driver, model: m.id, options: defaultOptions(m.options) })
    else setLocalChoice({ driver: first.driver, model: '', options: {} })
  }, [choice, providers])

  const project = projects.find((p) => p.path === cwd)

  const create = async (prompt: string): Promise<boolean> => {
    if (!choice?.driver) {
      if (!providersLoaded || providersLoading) {
        setError('Detecting agent CLIs on your PC, please wait a moment...')
        return false
      }
      setError('No agent CLI is available on your PC. Check Settings on the desktop.')
      return false
    }
    if (!cwd) {
      setError('Pick a project first.')
      return false
    }
    setError(null)
    try {
      const { threadId } = await api.newAgent({ prompt, cwd, choice, autoApprove })
      try {
        localStorage.setItem(LAST_KEY, JSON.stringify({ cwd, choice, autoApprove }))
      } catch {
        /* ignore */
      }
      void refreshSummaries()
      go(threadId)
      return true
    } catch (e) {
      setError(message(e))
      return false
    }
  }

  return (
    <div className="screen">
      <TopBar
        openDrawer={openDrawer}
        go={go}
        pill={providers.length === 0 ? (!providersLoaded || providersLoading ? 'Checking CLIs…' : 'No agent CLIs') : choiceLabel(choice, providers)}
        icon={choice?.driver ? providerIcon(choice.driver) : undefined}
        onPill={() => setSheet('model')}
      />
      <div className="scroll" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="starters">
          {error && <div className="say error" style={{ margin: '0 12px 8px' }}>{error}</div>}
          <button className="starter" onClick={() => setSheet('project')}>
            <Folder size={21} aria-hidden="true" />
            <span className="grow">Project</span>
            <span className="val">{project?.name || (projects.length ? 'Choose' : 'None')}</span>
          </button>
          <div className="starter" role="group">
            <ShieldCheck size={21} aria-hidden="true" />
            <span className="grow">Run without asking</span>
            <button className="switch" role="switch" aria-checked={autoApprove} aria-label="Run without asking" onClick={() => setAutoApprove((v) => !v)} />
          </div>
          <button className="starter" onClick={() => go('coordinator')}>
            <Workflow size={21} aria-hidden="true" />
            <span className="grow">Plan with the orchestrator</span>
          </button>
        </div>
      </div>
      <Composer placeholder="Ask anything" onCreate={create} />

      {sheet === 'model' && <ModelSheet value={choice} onChange={setLocalChoice} onClose={() => setSheet(null)} />}
      {sheet === 'project' && (
        <Sheet title="Project" onClose={() => setSheet(null)}>
          <div className="list">
            {projects.map((p) => (
              <button
                key={p.path}
                aria-pressed={p.path === cwd}
                onClick={() => {
                  setCwd(p.path)
                  setSheet(null)
                }}
              >
                <Folder size={18} aria-hidden="true" />
                <span style={{ flex: 1, minWidth: 0 }}>
                  {p.name}
                  <span className="sub" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.path}
                  </span>
                </span>
              </button>
            ))}
            {projects.length === 0 && <div className="empty">No projects yet. Add one on the desktop.</div>}
          </div>
        </Sheet>
      )}
    </div>
  )
}
