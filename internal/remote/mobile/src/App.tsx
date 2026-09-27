import { useCallback, useEffect, useState } from 'react'
import { api, getToken } from './api'
import { setPresence, startSync } from './store'
import { resyncPush } from './push'
import AuthScreen from './screens/Auth'
import Drawer from './screens/Drawer'
import Chat from './screens/Chat'
import ProjectScreen from './screens/Project'
import { useDrawer } from './screens/shell/useDrawer'
import { PcDownNotice } from './components/status/PcDownNotice'
import { NavCue, type Cue } from './screens/shell/NavCue'
import { classifyNavigation, initHistoryIndex } from './platform/historyDirection'
import { setChromeSurface } from './theme'

/** #/t/<threadId> opens a conversation; anything else is a new chat. */
function routeFromHash(): string | null {
  const m = window.location.hash.match(/^#\/t\/(.+)$/)
  return m ? decodeURIComponent(m[1]) : null
}

/** #/p/<path> opens a project's files and changes. */
function projectFromHash(): string | null {
  const m = window.location.hash.match(/^#\/p\/(.+)$/)
  return m ? decodeURIComponent(m[1]) : null
}

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null | 'offline'>(() => (getToken() ? true : null))
  const [threadId, setThreadId] = useState<string | null>(routeFromHash())
  const [project, setProject] = useState<string | null>(projectFromHash())
  const [cue, setCue] = useState<Cue | null>(null)

  const probe = useCallback(() => {
    const token = getToken()
    return api
      .status()
      .then((s) => setAuthenticated(s.authenticated !== false))
      .catch((e) => {
        const status = e && typeof e === 'object' && 'status' in e ? (e as { status: number }).status : 0
        setAuthenticated(status === 401 || status === 403 || !token ? false : 'offline')
      })
  }, [])

  const checkAuth = useCallback(() => {
    setAuthenticated(null)
    void probe()
  }, [probe])

  useEffect(() => {
    void probe()
  }, [probe])

  useEffect(() => {
    if (authenticated !== 'offline') return
    const retry = () => void probe()
    const timer = window.setInterval(retry, 3000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') retry()
    }
    window.addEventListener('online', retry)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('online', retry)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [authenticated, probe])

  useEffect(() => {
    if (!authenticated) return
    startSync()
    if (authenticated === true) void resyncPush()
  }, [authenticated])

  useEffect(() => {
    setPresence(project ? null : threadId)
  }, [threadId, project])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null
      if (data?.type !== 'open' || !data.url) return
      const target = new URL(data.url, window.location.origin)
      window.location.hash = target.hash
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    initHistoryIndex()
    const onHash = () => {
      const direction = classifyNavigation()
      const nextThread = routeFromHash()
      const nextProject = projectFromHash()
      setThreadId(nextThread)
      setProject(nextProject)
      if (direction !== 'push') setCue((c) => ({ key: (c?.key ?? 0) + 1, direction, threadId: nextThread, project: nextProject }))
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (authenticated === null) return <div className="screen" />
  if (authenticated === false) return <AuthScreen onDone={checkAuth} />
  return <Shell threadId={threadId} project={project} cue={cue} />
}

function Shell({ threadId, project, cue }: { threadId: string | null; project: string | null; cue: Cue | null }) {
  const { shell, open, covered, setOpen, handlers } = useDrawer()

  useEffect(() => {
    setChromeSurface(covered ? 'drawer' : 'chat')
    return () => setChromeSurface('chat')
  }, [covered])

  const go = useCallback(
    (id: string | null) => {
      window.location.hash = id ? `#/t/${encodeURIComponent(id)}` : '#/new'
      setOpen(false)
    },
    [setOpen],
  )
  const openProject = useCallback(
    (path: string) => {
      window.location.hash = `#/p/${encodeURIComponent(path)}`
      setOpen(false)
    },
    [setOpen],
  )

  return (
    <div className="shell" ref={shell} {...handlers}>
      <nav className="drawer" aria-hidden={!open} {...({ inert: open ? undefined : '' } as object)} aria-label="Chats">
        <Drawer current={project ? null : threadId} project={project} go={go} openProject={openProject} />
      </nav>
      <main className="main">
        {project ? (
          <ProjectScreen key={project} path={project} openDrawer={() => setOpen(true)} />
        ) : (
          <Chat key={threadId ?? 'new'} threadId={threadId} openDrawer={() => setOpen(true)} go={go} />
        )}
        {project ? <PcDownNotice /> : null}
        <NavCue cue={cue} />
        {covered ? <div className="main-cover" role="button" aria-label="Close menu" onClick={() => setOpen(false)} /> : null}
      </main>
    </div>
  )
}
