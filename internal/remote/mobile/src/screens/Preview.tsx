import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ExternalLink, Loader2, Play, RotateCw } from 'lucide-react'
import Sheet from '../components/Sheet'
import SiteCard from '../components/SiteCard'
import { api } from '../api'
import { serversForThread } from '../servers'
import { message, send } from '../store'
import type { DevServer, PreviewInfo } from '../types'

/** Desktop mode renders the site at this width, like a laptop browser. */
const DESKTOP_WIDTH = 1280

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
      {error && <div className="say error">{error}</div>}
      {!loaded && <div className="empty">Looking for dev servers…</div>}
      {loaded && mine.length > 0 && (
        <div>
          <span className="label">This chat</span>
          <div className="list">
            {mine.map((s) => (
              <SiteCard key={s.port} server={s} onOpen={onOpen} />
            ))}
          </div>
        </div>
      )}
      {loaded && mine.length === 0 && threadId && (
        <div className="list">
          <button disabled={!canAsk || waiting} onClick={() => void ask()}>
            {waiting ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
            <span style={{ flex: 1 }}>
              {waiting ? 'Waiting for the dev server…' : 'Ask the agent to start the dev server'}
              <span className="sub" style={{ display: 'block' }}>
                {waiting ? 'Opens by itself once it is running.' : canAsk ? 'It opens here as soon as it is up.' : 'This agent has ended.'}
              </span>
            </span>
          </button>
        </div>
      )}
      {loaded && others.length > 0 && (
        <div>
          <span className="label">Other sites on your PC</span>
          <div className="list">
            {others.map((s) => (
              <SiteCard key={s.port} server={s} onOpen={onOpen} />
            ))}
          </div>
        </div>
      )}
      {loaded && mine.length === 0 && others.length === 0 && !threadId && (
        <div className="empty">No dev servers are running on your PC.</div>
      )}
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
      <header className="bar">
        <button className="circle" onClick={onBack} aria-label="Back">
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <div className="seg" style={{ flex: 1, margin: 0 }}>
          <button aria-pressed={mode === 'phone'} onClick={() => setMode('phone')}>
            Phone
          </button>
          <button aria-pressed={mode === 'desktop'} onClick={() => setMode('desktop')}>
            Desktop
          </button>
        </div>
        <button className="circle" disabled={!live} onClick={() => setReloadKey((k) => k + 1)} aria-label="Reload">
          <RotateCw size={18} aria-hidden="true" />
        </button>
        <button
          className="circle"
          disabled={!live}
          onClick={() => preview?.url && window.open(preview.url, '_blank', 'noopener,noreferrer')}
          aria-label="Open in browser"
        >
          <ExternalLink size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="chat-title">
        {name} · localhost:{port}
      </div>

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
