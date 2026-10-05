import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Bot, Check, ChevronLeft, GitBranch, Loader2, Minus, Monitor, Play, Plus, Square, RotateCw, Smartphone, SquareArrowOutUpRight, SquareTerminal } from '../icons'
import { BarButton, ICON_STROKE } from '../components/chrome/BarButton'
import { GlassPill, GlassSegmented } from '../ui'
import { MorphButtons } from '../ui/glass/MorphButtons'
import { Sheet, SheetEmpty, SheetList, SheetNote, SheetPrimary, SheetRow } from '../components/sheet'
import SiteCard from '../components/SiteCard'
import { StatusCard } from '../components/status/StatusCard'
import { api } from '../api'
import { serversForThread } from '../servers'
import { useLongPress } from '../hooks/useLongPress'
import { message, send } from '../store'
import type { DevServer, PreviewInfo } from '../types'
import type { Checkout } from '../workspaceTypes'

/** Desktop mode renders the site at this width, like a laptop browser. */
const DESKTOP_WIDTHS = [1024, 1280, 1440, 1600, 1920] as const
const PHONE_FACTORS = [0.8, 0.9, 1, 1.15, 1.3, 1.5] as const
const DEFAULT_LEVEL = { phone: 2, desktop: 1 } as const

const DEVICE_OPTIONS = [
  { value: 'phone', label: 'Phone layout', icon: <Smartphone size={24} strokeWidth={ICON_STROKE} /> },
  { value: 'desktop', label: 'Desktop layout', icon: <Monitor size={24} strokeWidth={ICON_STROKE} /> },
] as const

const START_TIMEOUT_MS = 120_000
const START_POLL_MS = 600

const ASK_AGENT_PROMPT =
  "Start this project's dev server so I can preview it. Run it in the background so it keeps running after your turn, " +
  "don't wait on it, and reply with the local URL it listens on."

function findServer(groups: { servers: DevServer[] }[], port: number): DevServer | undefined {
  for (const g of groups) for (const s of g.servers) if (s.port === port) return s
  return undefined
}

type Launch =
  | { phase: 'idle' }
  | { phase: 'starting'; command?: string; folder?: string }
  | { phase: 'asking' }
  | { phase: 'failed'; error: string; noScript: boolean }

function folderLabel(dir: string, root?: string): string | undefined {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
  const d = norm(dir)
  if (!d) return undefined
  const r = root ? norm(root) : ''
  if (r && d.toLowerCase() === r.toLowerCase()) return undefined
  if (r && d.toLowerCase().startsWith(r.toLowerCase() + '/')) return d.slice(r.length + 1)
  return d.split('/').pop()
}

const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms))

export function PreviewLauncher({ threadId, cwd, onClose, onOpen }: {
  threadId: string | null
  cwd?: string
  onClose: () => void
  onOpen: (server: DevServer) => void
}) {
  const [mine, setMine] = useState<DevServer[]>([])
  const [others, setOthers] = useState<DevServer[]>([])
  const [loaded, setLoaded] = useState(false)
  const [launch, setLaunch] = useState<Launch>({ phase: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const [checkouts, setCheckouts] = useState<Checkout[]>([])
  const [target, setTarget] = useState<string | null>(null)
  const alive = useRef(true)
  const canStart = Boolean(threadId || cwd)
  const asking = launch.phase === 'asking'

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const load = useCallback(async () => {
    try {
      const groups = await api.servers()
      if (!alive.current) return
      const own = threadId ? serversForThread(groups, threadId) : []
      const ownPorts = new Set(own.map((s) => s.port))
      const rest = groups.flatMap((g) => g.servers).filter((s) => !ownPorts.has(s.port))
      setMine(own)
      setOthers(rest)
      setError(null)
      if (asking && own.length > 0) onOpen(own[0])
    } catch (e) {
      if (alive.current) setError(message(e))
    } finally {
      if (alive.current) setLoaded(true)
    }
  }, [threadId, onOpen, asking])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), asking ? 2500 : 8000)
    return () => window.clearInterval(id)
  }, [load, asking])

  useEffect(() => {
    if (!cwd) return
    let live = true
    api
      .gitOverview(cwd)
      .then((lanes) => {
        if (!live) return
        const list = (lanes ?? []).filter((lane) => lane.path && !lane.error)
        setCheckouts(list)
        setTarget((current) => {
          if (current) return current
          const own = threadId ? list.find((lane) => lane.threadId === threadId) : undefined
          return (own ?? list.find((lane) => lane.isMain) ?? list[0])?.path ?? null
        })
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [cwd, threadId])

  const start = useCallback(async () => {
    setLaunch({ phase: 'starting' })
    try {
      const where = target ?? cwd
      let server = await api.startDevServer(
        threadId ? { threadId, cwd: where, pinned: Boolean(target) } : { cwd: where, pinned: Boolean(target) },
      )
      const deadline = Date.now() + START_TIMEOUT_MS
      while (alive.current && !server.port && server.status === 'running' && Date.now() < deadline) {
        setLaunch({ phase: 'starting', command: server.command, folder: folderLabel(server.cwd, cwd) })
        await wait(START_POLL_MS)
        server = await api.devServer(server.id)
      }
      if (!alive.current) return
      if (server.port) {
        onOpen({ pid: 0, port: server.port, name: server.name, kind: 'dev', ownerThreadId: threadId ?? undefined, cwd: server.cwd })
        return
      }
      const last = server.log?.filter((l) => l.trim()).pop()
      const what = server.command || 'The dev server'
      setLaunch({
        phase: 'failed',
        noScript: false,
        error:
          server.status === 'running'
            ? `${what} is running but has not said which port it listens on.`
            : `${what} stopped while starting${last ? `: ${last}` : '.'}`,
      })
    } catch (e) {
      if (!alive.current) return
      const noScript = typeof e === 'object' && e !== null && (e as { status?: number }).status === 422
      setLaunch({ phase: 'failed', noScript, error: noScript ? (e as Error).message : message(e) })
    }
  }, [threadId, cwd, target, onOpen])

  const ask = async () => {
    if (!threadId) return
    setLaunch({ phase: 'asking' })
    try {
      await send(threadId, ASK_AGENT_PROMPT)
    } catch (e) {
      setLaunch({ phase: 'failed', noScript: false, error: message(e) })
    }
  }

  const failed = launch.phase === 'failed' ? launch : null
  const busy = launch.phase === 'starting' || asking
  const offerAgent = Boolean(threadId) && !busy

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
      {checkouts.length > 1 && canStart && !busy ? (
        <>
          <span className="sheet-section">Run in</span>
          <SheetList>
            {checkouts.map((lane) => (
              <SheetRow
                key={lane.path}
                icon={GitBranch}
                label={lane.isMain ? 'Main' : lane.title || lane.branch}
                detail={lane.isMain ? lane.branch : lane.branch !== lane.title ? lane.branch : folderLabel(lane.path, cwd)}
                trailing={target === lane.path ? <Check size={18} className="sheet-row-chevron" aria-hidden /> : undefined}
                onClick={() => setTarget(lane.path)}
              />
            ))}
          </SheetList>
        </>
      ) : null}
      {loaded && canStart && (mine.length === 0 || checkouts.length > 1) ? (
        <>
          {launch.phase === 'starting' ? (
            <SheetList>
              <SheetRow
                icon={SquareTerminal}
                label={launch.command || 'Starting dev server'}
                detail={launch.folder}
                trailing={<Loader2 size={18} className="spin sheet-row-chevron" aria-hidden />}
              />
            </SheetList>
          ) : null}
          {launch.phase === 'starting' ? (
            <SheetNote>{launch.command ? 'Running on your PC. The preview opens once the site is up.' : 'Finding the dev script on your PC'}</SheetNote>
          ) : null}
          {asking ? (
            <>
              <SheetList>
                <SheetRow icon={Bot} label="Asked the agent to start it" trailing={<Loader2 size={18} className="spin sheet-row-chevron" aria-hidden />} />
              </SheetList>
              <SheetNote>The preview opens once a server for this chat is listening.</SheetNote>
            </>
          ) : null}
          {failed ? <SheetNote tone="error">{failed.error}</SheetNote> : null}
          {failed?.noScript && threadId ? (
            <SheetPrimary onClick={() => void ask()}>
              <Bot size={20} strokeWidth={ICON_STROKE} aria-hidden />
              <span>Ask the agent to start it</span>
            </SheetPrimary>
          ) : null}
          {launch.phase === 'idle' || (failed && !failed.noScript) ? (
            <SheetPrimary onClick={() => void start()}>
              <Play size={20} strokeWidth={ICON_STROKE} aria-hidden />
              <span>{failed ? 'Try again' : 'Start dev server'}</span>
            </SheetPrimary>
          ) : null}
          {offerAgent && !failed?.noScript ? (
            <SheetList>
              <SheetRow icon={Bot} label="Ask the agent instead" chevron onClick={() => void ask()} />
            </SheetList>
          ) : null}
        </>
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
const previewCache = new Map<number, PreviewInfo>()

export function PreviewScreen({
  port,
  name,
  onBack,
  onGone,
  onStopped,
}: {
  port: number
  name: string
  onBack: () => void
  onGone?: () => void
  onStopped?: () => void
}) {
  const [preview, setPreviewState] = useState<PreviewInfo | null>(() => previewCache.get(port) ?? null)
  const setPreview = useCallback(
    (next: PreviewInfo | null) => {
      if (next?.url && next.state !== 'failed') previewCache.set(port, next)
      setPreviewState(next)
    },
    [port],
  )
  const [pid, setPid] = useState(0)
  const gone = useRef(onGone)
  gone.current = onGone
  const [stopping, setStopping] = useState(false)
  const stop = () => {
    if (!pid || stopping) return
    setStopping(true)
    api
      .devServerStop(pid, port)
      .then(() => {
        previewCache.delete(port)
        onStopped?.()
      })
      .catch((e) => setError(message(e)))
      .finally(() => setStopping(false))
  }
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'phone' | 'desktop'>('phone')
  const [levels, setLevels] = useState<{ phone: number; desktop: number }>({ ...DEFAULT_LEVEL })
  const [adjusting, setAdjusting] = useState(false)
  const [resolution, setResolution] = useState<{ w: number; h: number } | null>(null)
  const hold = useLongPress(() => setAdjusting((a) => !a))
  const steps = mode === 'desktop' ? DESKTOP_WIDTHS.length : PHONE_FACTORS.length
  const level = levels[mode]
  const shift = (by: number) => setLevels((l) => ({ ...l, [mode]: Math.max(0, Math.min(steps - 1, l[mode] + by)) }))
  const [reloadKey, setReloadKey] = useState(0)

  const poll = useCallback(async () => {
    try {
      const found = findServer(await api.servers(), port)
      if (!found) {
        previewCache.delete(port)
        if (gone.current) {
          gone.current()
          return
        }
        setError(`Nothing is running on localhost:${port} any more.`)
        return
      }
      setPid(found.pid)
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
  }, [port, setPreview])

  useEffect(() => {
    api
      .previewStart(port)
      .then((p) =>
        setPreviewState((cur) => {
          const next = cur?.state === 'live' ? cur : p
          if (next?.url && next.state !== 'failed') previewCache.set(port, next)
          return next
        }),
      )
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
          <div className="preview-device" {...hold}>
            <GlassSegmented options={DEVICE_OPTIONS} value={mode} onChange={setMode} height={44} padding={0} gap={6} fill="var(--glass-control)" lensFill="rgba(var(--ink), 0.2)" />
          </div>
          <MorphButtons
            className="topbar-end preview-actions"
            anchor="end"
            items={[
              {
                id: 'stop',
                label: 'Stop dev server',
                icon: <Square size={24} strokeWidth={ICON_STROKE} />,
                disabled: !pid || stopping,
                actions: [
                  { id: 'stop', label: 'Stop server', tone: 'danger', onSelect: stop },
                  { id: 'cancel', label: 'Cancel', dismiss: true },
                ],
              },
              { id: 'reload', label: 'Reload', icon: <RotateCw size={24} strokeWidth={ICON_STROKE} />, disabled: !live, onClick: () => setReloadKey((k) => k + 1) },
              {
                id: 'open',
                label: 'Open in browser',
                icon: <SquareArrowOutUpRight size={24} strokeWidth={ICON_STROKE} />,
                disabled: !live,
                onClick: () => preview?.url && window.open(preview.url, '_blank', 'noopener,noreferrer'),
              },
            ]}
          />
        </div>
        <div className="preview-site">
          {adjusting ? (
            <GlassPill height={36} fill="var(--glass-control)" className="preview-scale">
              <button type="button" className="preview-scale-step" aria-label="Lower resolution" disabled={level === 0} onClick={() => shift(-1)}>
                <Minus size={18} strokeWidth={ICON_STROKE} />
              </button>
              <button type="button" className="preview-scale-value" onClick={() => setLevels((l) => ({ ...l, [mode]: DEFAULT_LEVEL[mode] }))}>
                {resolution ? `${resolution.w} × ${resolution.h}` : '…'}
              </button>
              <button type="button" className="preview-scale-step" aria-label="Higher resolution" disabled={level === steps - 1} onClick={() => shift(1)}>
                <Plus size={18} strokeWidth={ICON_STROKE} />
              </button>
              <button type="button" className="preview-scale-step" aria-label="Done" onClick={() => setAdjusting(false)}>
                <Check size={18} strokeWidth={ICON_STROKE} />
              </button>
            </GlassPill>
          ) : (
            <GlassPill height={30} fill="var(--glass-control)" className="preview-site-pill">
              {name} · localhost:{port}
              {resolution ? ` · ${resolution.w}×${resolution.h}` : ''}
            </GlassPill>
          )}
        </div>
      </header>

      <div className="preview-stage">
        {live ? (
          <Frame key={`${preview!.url}-${reloadKey}`} url={preview!.url!} desktop={mode === 'desktop'} level={level} onResolution={setResolution} />
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
 * at the chosen desktop width and scales it down; held upright, the frame is turned 90°
 * so the phone can be rotated to read a landscape desktop page full size.
 */
function Frame({
  url,
  desktop,
  level,
  onResolution,
}: {
  url: string
  desktop: boolean
  level: number
  onResolution: (r: { w: number; h: number }) => void
}) {
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
  let res = { w: Math.round(size.w), h: Math.round(size.h) }
  if (desktop && size.w > 0) {
    const width = DESKTOP_WIDTHS[level] ?? DESKTOP_WIDTHS[DEFAULT_LEVEL.desktop]
    const portrait = size.h > size.w
    const across = portrait ? size.h : size.w
    const down = portrait ? size.w : size.h
    const scale = across / width
    const height = down / scale
    res = { w: width, h: Math.round(height) }
    style = {
      width,
      height,
      position: 'absolute',
      left: 0,
      top: 0,
      transformOrigin: '0 0',
      transform: portrait ? `translate(${size.w}px, 0) rotate(90deg) scale(${scale})` : `scale(${scale})`,
    }
  } else if (size.w > 0) {
    const factor = PHONE_FACTORS[level] ?? 1
    res = { w: Math.round(size.w * factor), h: Math.round(size.h * factor) }
    if (factor !== 1) {
      style = {
        width: size.w * factor,
        height: size.h * factor,
        position: 'absolute',
        left: 0,
        top: 0,
        transformOrigin: '0 0',
        transform: `scale(${1 / factor})`,
      }
    }
  }

  useEffect(() => {
    if (res.w > 0) onResolution(res)
  }, [res.w, res.h, onResolution])

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
