import React, { useCallback, useEffect, useRef, useState } from 'react'
import { api, getToken } from './api'
import { setPresence, startSync, useStore } from './store'
import { resyncPush } from './push'
import AuthScreen from './screens/Auth'
import Drawer from './screens/Drawer'
import Chat from './screens/Chat'
import ProjectScreen from './screens/Project'

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
    const onHash = () => {
      setThreadId(routeFromHash())
      setProject(projectFromHash())
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (authenticated === null) return <div className="screen" />
  if (authenticated === false) return <AuthScreen onDone={checkAuth} />
  return <Shell threadId={threadId} project={project} />
}

function PcDownBanner() {
  const pcDown = useStore((st) => st.pcDown)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!pcDown) {
      setShown(false)
      return
    }
    const timer = window.setTimeout(() => setShown(true), 1500)
    return () => window.clearTimeout(timer)
  }, [pcDown])
  if (!shown) return null
  return (
    <div className="pc-down" role="status">
      <span className="dot" aria-hidden="true" />
      <span>PC not responding · showing saved chats</span>
    </div>
  )
}

/**
 * The drawer follows the finger: progress is written straight to a CSS
 * variable while dragging (no React renders), and on release the projected
 * position (current + velocity) picks the side. Grabbing mid-animation starts
 * from where the drawer visibly is, so the motion is always interruptible.
 */
function Shell({ threadId, project }: { threadId: string | null; project: string | null }) {
  const shell = useRef<HTMLDivElement>(null)
  const [open, setOpenState] = useState(false)
  const progress = useRef(0)
  const drag = useRef<{ x: number; start: number; t: number; v: number; moved: boolean; axis?: 'x' | 'y'; y: number; onMain: boolean } | null>(null)

  const width = () => Math.min(window.innerWidth * 0.84, 340)
  const paint = (p: number, settle: boolean) => {
    const el = shell.current
    if (!el) return
    progress.current = p
    el.classList.toggle('settle', settle)
    el.style.setProperty('--p', String(p))
  }
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next)
    paint(next ? 1 : 0, true)
  }, [])

  const currentProgress = () => {
    const main = shell.current?.querySelector('.main') as HTMLElement | null
    if (!main) return progress.current
    const m = new DOMMatrixReadOnly(getComputedStyle(main).transform)
    return Math.max(0, Math.min(1, m.m41 / width()))
  }

  const onDown = (e: React.PointerEvent) => {
    const fromEdge = e.clientX < 24
    if (!open && !fromEdge) return
    const p = currentProgress()
    paint(p, false)
    const onMain = Boolean((e.target as Element).closest?.('.main'))
    drag.current = { x: e.clientX, y: e.clientY, start: p, t: e.timeStamp, v: 0, moved: false, onMain }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.axis) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (d.axis === 'y') {
        drag.current = null
        paint(open ? 1 : 0, true)
        return
      }
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
    }
    const raw = d.start + dx / width()
    // Rubber-band past either end instead of a hard stop.
    const p = raw < 0 ? raw / 4 : raw > 1 ? 1 + (raw - 1) / 4 : raw
    const dt = Math.max(1, e.timeStamp - d.t)
    d.v = (p - progress.current) / dt
    d.t = e.timeStamp
    d.moved = true
    paint(p, false)
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (!d.moved) {
      // A tap on the pushed-aside chat closes the drawer; taps inside it are clicks.
      if (open && d.onMain) setOpen(false)
      else paint(open ? 1 : 0, true)
      return
    }
    const projected = progress.current + d.v * 180
    setOpen(projected > 0.5)
  }

  useEffect(() => {
    paint(0, false)
  }, [])

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
    <div className="shell" ref={shell} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <nav className="drawer" aria-hidden={!open} {...({ inert: open ? undefined : '' } as object)} aria-label="Chats">
        <Drawer current={project ? null : threadId} project={project} go={go} openProject={openProject} />
      </nav>
      <main className="main">
        {project ? (
          <ProjectScreen key={project} path={project} openDrawer={() => setOpen(true)} />
        ) : (
          <Chat key={threadId ?? 'new'} threadId={threadId} openDrawer={() => setOpen(true)} go={go} />
        )}
        <PcDownBanner />
        {open && <div className="main-cover" aria-label="Close menu" />}
      </main>
    </div>
  )
}
