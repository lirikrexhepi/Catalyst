import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, Loader2, Monitor, Play, RotateCw, Smartphone, SquareArrowOutUpRight } from 'lucide-react'
import { BarButton, ICON_STROKE } from '../components/chrome/BarButton'
import { GlassPill, GlassSegmented } from '../ui'
import { Sheet, SheetEmpty, SheetList, SheetNote, SheetPrimary } from '../components/sheet'
import SiteCard from '../components/SiteCard'
import { api } from '../api'
import { serversForThread } from '../servers'
import { message, send } from '../store'
import type { DevServer, PreviewInfo } from '../types'

/** Desktop mode renders the site at this width, like a laptop browser. */
const DESKTOP_WIDTH = 1280

const DEVICE_OPTIONS = [
  { value: 'phone', label: 'Phone layout', icon: <Smartphone size={24} strokeWidth={ICON_STROKE} /> },
  { value: 'desktop', label: 'Desktop layout', icon: <Monitor size={24} strokeWidth={ICON_STROKE} /> },
] as const

const START_PROMPT =
  "Start this project's dev server so I can preview it. Run it in the background so it keeps running after your turn, " +
  "don't wait on it, and reply with the local URL it listens on."

function findServer(groups: { servers: DevServer[] }[], port: number): DevServer | undefined {
  for (const g of groups) for (const s of g.servers) if (s.port === port) return s
  return undefined
}

/**
 * The Play button's flow. One dev server for this chat opens straight away;
 * otherwise a picker lists this chat's servers, the rest of the PC's, and can
 * ask the agent to start one and then waits for it to appear.
 */
export function PreviewLauncher({ threadId, canAsk, onClose, onOpen }: {
  threadId: string | null
  canAsk: boolean
  onClose: () => void
  onOpen: (server: DevServer) => void
}) {
  const [mine, setMine] = useState<DevServer[]>([])
  const [others, setOthers] = useState<DevServer[]>([])
  const [loaded, setLoaded] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const first = useRef(true)

  const load = useCallback(async () => {
    try {
      const groups = await api.servers()
      const own = threadId ? serversForThread(groups, threadId) : []
      const ownPorts = new Set(own.map((s) => s.port))
      const rest = groups.flatMap((g) => g.servers).filter((s) => !ownPorts.has(s.port))
      setMine(own)
      setOthers(rest)
      setError(null)
      // The common case skips the picker: exactly one site for this chat.
      if (first.current && own.length === 1) onOpen(own[0])
      if (waiting && own.length > 0) {
        setWaiting(false)
        onOpen(own[0])
      }
    } catch (e) {
      setError(message(e))
    } finally {
      first.current = false
      setLoaded(true)
    }
  }, [threadId, waiting, onOpen])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), waiting ? 2500 : 8000)
    return () => window.clearInterval(id)
  }, [load, waiting])

  const ask = async () => {
    if (!threadId) return
    setError(null)
    try {
      await send(threadId, START_PROMPT)
      setWaiting(true)
    } catch (e) {
      setError(message(e))
    }
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
      {loaded && mine.length === 0 && threadId ? (
        <SheetPrimary disabled={!canAsk || waiting} onClick={() => void ask()}>
          {waiting ? <Loader2 size={20} className="spin" aria-hidden /> : <Play size={20} strokeWidth={ICON_STROKE} aria-hidden />}
          <span>{waiting ? 'Starting dev server' : 'Start dev server'}</span>
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
      {loaded && mine.length === 0 && others.length === 0 && !threadId ? (
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
    void poll()
  }, [poll])
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
          <GlassSegmented options={DEVICE_OPTIONS} value={mode} onChange={setMode} height={44} padding={0} gap={6} fill="var(--glass-control)" lensFill="rgba(255,255,255,0.22)" />
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
          <div className="empty">
            {error ? (
              <>
                <strong>Preview unavailable</strong>
                {error}
                <div style={{ marginTop: 14 }}>
                  <button className="btn" onClick={retry}>
                    Try again
                  </button>
                </div>
              </>
            ) : (
              <>
                <Loader2 size={22} className="spin" aria-hidden="true" />
                <div style={{ marginTop: 10 }}>Creating a public link for your dev server…</div>
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
