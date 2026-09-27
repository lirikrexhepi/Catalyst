import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, Loader2, Monitor, Play, RotateCw, Smartphone, SquareArrowOutUpRight } from 'lucide-react'
import { BarButton, ICON_STROKE } from '../components/chrome/BarButton'
import { GlassPill, GlassSegmented } from '../ui'
import { Sheet, SheetEmpty, SheetList, SheetNote, SheetPrimary } from '../components/sheet'
import SiteCard from '../components/SiteCard'
import { StatusCard } from '../components/status/StatusCard'
import { api } from '../api'
import { serversForThread } from '../servers'
import { message } from '../store'
import type { DevServer, PreviewInfo } from '../types'

/** Desktop mode renders the site at this width, like a laptop browser. */
const DESKTOP_WIDTH = 1280

const DEVICE_OPTIONS = [
  { value: 'phone', label: 'Phone layout', icon: <Smartphone size={24} strokeWidth={ICON_STROKE} /> },
  { value: 'desktop', label: 'Desktop layout', icon: <Monitor size={24} strokeWidth={ICON_STROKE} /> },
] as const

const START_TIMEOUT_MS = 120_000
const START_POLL_MS = 600

function findServer(groups: { servers: DevServer[] }[], port: number): DevServer | undefined {
  for (const g of groups) for (const s of g.servers) if (s.port === port) return s
  return undefined
}

export function PreviewLauncher({ threadId, cwd, onClose, onOpen }: {
  threadId: string | null
  cwd?: string
  onClose: () => void
  onOpen: (server: DevServer) => void
}) {
  const [mine, setMine] = useState<DevServer[]>([])
  const [others, setOthers] = useState<DevServer[]>([])
  const [loaded, setLoaded] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const first = useRef(true)
  const canStart = Boolean(threadId || cwd)

  const load = useCallback(async () => {
    try {
      const groups = await api.servers()
      const own = threadId ? serversForThread(groups, threadId) : []
      const ownPorts = new Set(own.map((s) => s.port))
      const rest = groups.flatMap((g) => g.servers).filter((s) => !ownPorts.has(s.port))
      setMine(own)
      setOthers(rest)
      if (first.current && own.length === 1) onOpen(own[0])
    } catch (e) {
      setError(message(e))
    } finally {
      first.current = false
      setLoaded(true)
    }
  }, [threadId, onOpen])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), 8000)
    return () => window.clearInterval(id)
  }, [load])

  const start = async () => {
    setError(null)
    setStarting(true)
    try {
      let server = await api.startDevServer(threadId ? { threadId, cwd } : { cwd })
      const deadline = Date.now() + START_TIMEOUT_MS
      while (!server.port && server.status === 'running' && Date.now() < deadline) {
        await new Promise((r) => window.setTimeout(r, START_POLL_MS))
        server = await api.devServer(server.id)
      }
      if (server.port) {
        onOpen({ pid: 0, port: server.port, name: server.name, kind: 'dev', ownerThreadId: threadId ?? undefined })
        return
      }
      const last = server.log?.filter((l) => l.trim()).pop()
      setError(server.status === 'running' ? 'The dev server has not reported a port yet.' : last || 'The dev server stopped while starting.')
    } catch (e) {
      setError(message(e))
    }
    setStarting(false)
  }

  return (
    <Sheet title="Preview" onClose={onClose}>
      {!loaded ? <SheetNote>Looking for dev servers</SheetNote> : null}
      {loaded && mine.length > 0 ? (
        <SheetList>
          {mine.map((s) => (
            <SiteCard key={s.port} server={s} onOpen={onOpen} />
          ))}
        </SheetList>
      ) : null}
      {loaded && mine.length === 0 && canStart ? (
        <SheetPrimary disabled={starting} onClick={() => void start()}>
          {starting ? <Loader2 size={20} className="spin" aria-hidden /> : <Play size={20} strokeWidth={ICON_STROKE} aria-hidden />}
          <span>{starting ? 'Starting dev server' : 'Start dev server'}</span>
        </SheetPrimary>
      ) : null}
      {loaded && others.length > 0 ? (
        <>
          <span className="sheet-section">On your PC</span>
          <SheetList scroll>
            {others.map((s) => (
              <SiteCard key={s.port} server={s} onOpen={onOpen} />
            ))}
          </SheetList>
        </>
      ) : null}
      {loaded && mine.length === 0 && others.length === 0 && !canStart ? (
        <SheetList>
          <SheetEmpty>No dev servers running</SheetEmpty>
        </SheetList>
      ) : null}
      {error ? <SheetNote tone="error">{error}</SheetNote> : null}
    </Sheet>
  )
}

/**
 * A running site on the phone. The PC shares the dev server through a
 * Cloudflare link; this keeps asking for it until it is live, follows it when
 * the PC replaces a dropped tunnel, and shows it either as a phone would or
 * as a desktop browser would, turned sideways to use the whole screen.
 */
export function PreviewScreen({ port, name, onBack }: { port: number; name: string; onBack: () => void }) {
  const [preview, setPreview] = useState<PreviewInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'phone' | 'desktop'>('phone')
  const [reloadKey, setReloadKey] = useState(0)

  const poll = useCallback(async () => {
    try {
      const found = findServer(await api.servers(), port)
      if (!found) {
        setError(`Nothing is running on localhost:${port} any more.`)
        return
      }
      const p = found.preview
      // No tunnel, or a failed one: ask for a fresh one. Start is idempotent.
      if (!p || p.state === 'failed') {
        if (p?.state === 'failed') setError(p.error || 'The link could not be created.')
        setPreview(await api.previewStart(port))
        return
      }
      setError(null)
      setPreview(p)
    } catch (e) {
      setError(message(e))
    }
  }, [port])

  useEffect(() => {
    api
      .previewStart(port)
      .then((p) => setPreview((cur) => (cur?.state === 'live' ? cur : p)))
      .catch(() => undefined)
    void poll()
  }, [poll, port])
  const live = preview?.state === 'live' && Boolean(preview.url)
  useEffect(() => {
    const id = window.setInterval(() => void poll(), live ? 10000 : 2000)
    return () => window.clearInterval(id)
  }, [poll, live])

  const retry = () => {
    setError(null)
    setPreview(null)
    api
      .previewStart(port)
      .then(setPreview)
      .catch((e) => setError(message(e)))
  }

  return (
    <div className="screen viewer preview">
      <header className="topbar preview-bar">
        <div className="topbar-row">
          <BarButton icon={ChevronLeft} label="Back" onClick={onBack} />
          <GlassSegmented options={DEVICE_OPTIONS} value={mode} onChange={setMode} height={44} padding={0} gap={6} fill="var(--glass-control)" lensFill="rgba(var(--ink), 0.2)" />
          <div className="topbar-end">
            <BarButton icon={RotateCw} label="Reload" onClick={() => setReloadKey((k) => k + 1)} disabled={!live} />
            <BarButton icon={SquareArrowOutUpRight} label="Open in browser" onClick={() => preview?.url && window.open(preview.url, '_blank', 'noopener,noreferrer')} disabled={!live} />
          </div>
        </div>
        <div className="preview-site">
          <GlassPill height={30} fill="var(--glass-control)" className="preview-site-pill">
            {name} · localhost:{port}
          </GlassPill>
        </div>
      </header>

      <div className="preview-stage">
        {live ? (
          <Frame key={`${preview!.url}-${reloadKey}`} url={preview!.url!} desktop={mode === 'desktop'} />
        ) : (
          <div className="preview-wait">
            {error ? (
              <StatusCard title="Preview unavailable" action={{ label: 'Retry', onClick: retry }}>
                {error}
              </StatusCard>
            ) : (
              <>
                <Loader2 size={22} className="spin" aria-hidden />
                <span>Opening preview</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * The site itself. Phone mode fills the stage. Desktop mode lays the page out
 * at DESKTOP_WIDTH and scales it down; held upright, the frame is turned 90°
 * so the phone can be rotated to read a landscape desktop page full size.
 */
function Frame({ url, desktop }: { url: string; desktop: boolean }) {
  const stage = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = stage.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  let style: React.CSSProperties = { width: '100%', height: '100%' }
  if (desktop && size.w > 0) {
    const portrait = size.h > size.w
    // Upright phone: the long side becomes the page width.
    const across = portrait ? size.h : size.w
    const down = portrait ? size.w : size.h
    const scale = across / DESKTOP_WIDTH
    const height = down / scale
    style = {
      width: DESKTOP_WIDTH,
      height,
      position: 'absolute',
      left: 0,
      top: 0,
      transformOrigin: '0 0',
      transform: portrait ? `translate(${size.w}px, 0) rotate(90deg) scale(${scale})` : `scale(${scale})`,
    }
  }

  return (
    <div className="preview-frame" ref={stage}>
      <iframe
        src={url}
        title="Site preview"
        style={style}
        // Same rights the site would have in its own tab, minus top navigation.
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
        allow="clipboard-write; fullscreen"
      />
    </div>
  )
}
