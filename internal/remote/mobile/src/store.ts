import { useSyncExternalStore } from 'react'
import { api, getBase, getToken } from './api'
import { reduceEvent, userBlock } from './feed/reducer'
import type { AgentStreamBlock } from './feed/types'
import type {
  FileRef,
  ModelChoice,
  ProviderInfo,
  RuntimeEvent,
  ServerMessage,
  ThreadSummary,
} from './types'

/**
 * One store for the whole app. Threads the user opens keep a folded block
 * list (the same reducer the desktop uses); every thread keeps a summary for
 * the inbox. Live events arrive in batches over one socket and are applied
 * after the snapshot a thread was loaded from, so nothing shows twice and
 * nothing that happened while loading is lost.
 */

export interface QueuedMessage {
  id: string
  text: string
  files: FileRef[]
  choice?: ModelChoice
}

export interface ThreadState {
  blocks: AgentStreamBlock[]
  lastSeq: number
  loaded: boolean
  loading: boolean
  error?: string
  busy: boolean
  turnStartedAt?: number
  /** Duration of each finished turn, keyed by the last block id of that turn. */
  turnMs: Record<string, number>
  queued: QueuedMessage[]
  sending: boolean
}

export type Connection = 'connecting' | 'live' | 'offline'

interface State {
  summaries: ThreadSummary[]
  summariesLoaded: boolean
  threads: Record<string, ThreadState>
  providers: ProviderInfo[]
  connection: Connection
  /** Model picked on the phone for a thread's next sends; overrides its summary. */
  choices: Record<string, ModelChoice>
}

let state: State = {
  summaries: [],
  summariesLoaded: false,
  threads: {},
  providers: [],
  connection: 'connecting',
  choices: loadChoices(),
}

const listeners = new Set<() => void>()

function set(next: Partial<State>) {
  state = { ...state, ...next }
  for (const l of listeners) l()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useStore<T>(select: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => select(state))
}

export function getState(): State {
  return state
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

function emptyThread(): ThreadState {
  return { blocks: [], lastSeq: 0, loaded: false, loading: false, busy: false, turnMs: {}, queued: [], sending: false }
}

function patchThread(threadId: string, patch: (t: ThreadState) => ThreadState) {
  const current = state.threads[threadId] ?? emptyThread()
  const next = patch(current)
  if (next === current) return
  set({ threads: { ...state.threads, [threadId]: next } })
}

/** Folds events into a thread, tracking busy state and turn durations. */
function fold(t: ThreadState, events: RuntimeEvent[]): ThreadState {
  let { blocks, busy, turnStartedAt, turnMs } = t
  let lastSeq = t.lastSeq
  let durations: Record<string, number> | null = null
  for (const event of events) {
    blocks = reduceEvent(blocks, event)
    if (event.seq > lastSeq) lastSeq = event.seq
    if (event.kind === 'turn.started') {
      busy = true
      turnStartedAt = event.at || Date.now()
    } else if (event.kind === 'turn.completed' || event.kind === 'turn.failed' || event.kind === 'session.stopped') {
      if (busy && turnStartedAt && blocks.length > 0 && event.kind !== 'session.stopped') {
        durations = durations ?? { ...turnMs }
        durations[blocks[blocks.length - 1].id] = Math.max(0, (event.at || Date.now()) - turnStartedAt)
      }
      busy = false
      turnStartedAt = undefined
    }
  }
  return { ...t, blocks, busy, turnStartedAt, lastSeq, turnMs: durations ?? turnMs }
}

export async function loadThread(threadId: string, force = false) {
  const current = state.threads[threadId]
  if (current?.loading || (current?.loaded && !force)) return
  patchThread(threadId, (t) => ({ ...t, loading: true, error: undefined }))
  try {
    const snapshot = await api.thread(threadId)
    patchThread(threadId, (t) => {
      const base: ThreadState = { ...emptyThread(), queued: t.queued, loaded: true }
      const folded = fold(base, snapshot.events ?? [])
      // Keep optimistic bubbles the snapshot does not contain yet.
      const pending = t.blocks.filter(
        (b) => b.type === 'user' && b.pending && !folded.blocks.some((f) => f.type === 'user' && f.content === b.content),
      )
      return {
        ...folded,
        blocks: [...folded.blocks, ...pending],
        lastSeq: snapshot.lastSeq || folded.lastSeq,
        loading: false,
        sending: t.sending,
      }
    })
  } catch (e) {
    patchThread(threadId, (t) => ({ ...t, loading: false, error: message(e) }))
  }
}

// ---------------------------------------------------------------------------
// Live events
// ---------------------------------------------------------------------------

let refreshTimer: number | undefined

function scheduleSummaryRefresh(delay = 1200) {
  window.clearTimeout(refreshTimer)
  refreshTimer = window.setTimeout(() => void refreshSummaries(), delay)
}

function applyEvents(events: RuntimeEvent[]) {
  const byThread = new Map<string, RuntimeEvent[]>()
  for (const event of events) {
    if (!event?.threadId) continue
    const list = byThread.get(event.threadId)
    if (list) list.push(event)
    else byThread.set(event.threadId, [event])
  }
  if (byThread.size === 0) return

  let threads = state.threads
  let summaries = state.summaries
  let refresh = false
  const finished: string[] = []

  for (const [threadId, list] of byThread) {
    const t = threads[threadId]
    if (t?.loaded) {
      const fresh = t.lastSeq > 0 ? list.filter((e) => !(e.seq > 0 && e.seq <= t.lastSeq)) : list
      if (fresh.length > 0) threads = { ...threads, [threadId]: fold(t, fresh) }
    }

    const index = summaries.findIndex((s) => s.threadId === threadId)
    if (index < 0) {
      refresh = true
    } else {
      const summary = { ...summaries[index] }
      for (const e of list) {
        summary.lastActivity = Math.max(summary.lastActivity ?? 0, e.at || 0)
        switch (e.kind) {
          case 'turn.started':
            summary.busy = true
            summary.turnStartedAt = e.at
            break
          case 'turn.completed':
          case 'turn.failed':
            if (summary.busy && summary.turnStartedAt) summary.lastTurnMs = (e.at || Date.now()) - summary.turnStartedAt
            summary.busy = false
            summary.turnStartedAt = undefined
            summary.attention = ''
            finished.push(threadId)
            refresh = true
            break
          case 'agent.message':
            summary.preview = e.delta ? ((summary.preview ?? '') + (e.text ?? '')).slice(-240) : e.text
            break
          case 'approval.request':
            summary.attention = 'approval'
            break
          case 'question.asked':
            summary.attention = 'question'
            break
          case 'approval.resolved':
          case 'question.answered':
            summary.attention = ''
            refresh = true
            break
          case 'session.started':
          case 'session.stopped':
            refresh = true
            break
        }
      }
      summaries = [...summaries]
      summaries[index] = summary
    }
  }

  set({ threads, summaries })
  if (refresh) scheduleSummaryRefresh()
  for (const threadId of finished) void drainQueue(threadId)
}

// ---------------------------------------------------------------------------
// Summaries, models
// ---------------------------------------------------------------------------

export async function refreshSummaries() {
  try {
    const summaries = await api.threads()
    set({ summaries: Array.isArray(summaries) ? summaries : [], summariesLoaded: true })
  } catch {
    set({ summariesLoaded: true })
  }
}

export async function loadProviders(refresh = false) {
  if (!refresh && state.providers.length > 0) return
  try {
    const providers = await api.models(refresh)
    set({ providers: Array.isArray(providers) ? providers : [] })
  } catch {
    /* keep what we have */
  }
}

// ---------------------------------------------------------------------------
// Model choice
// ---------------------------------------------------------------------------

const CHOICES_KEY = 'orchestrator_model_choices'

function loadChoices(): Record<string, ModelChoice> {
  try {
    return JSON.parse(localStorage.getItem(CHOICES_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

export function setChoice(threadId: string, choice: ModelChoice) {
  const choices = { ...state.choices, [threadId]: choice }
  try {
    localStorage.setItem(CHOICES_KEY, JSON.stringify(choices))
  } catch {
    /* private mode */
  }
  set({ choices })
}

/** The model a thread will use next: the phone's pick, else what it runs. */
export function effectiveChoice(threadId: string): ModelChoice | undefined {
  const picked = state.choices[threadId]
  if (picked) return picked
  const summary = state.summaries.find((s) => s.threadId === threadId)
  if (summary?.driver) return { driver: summary.driver, model: summary.model, options: summary.options }
  return undefined
}

/** A choice worth sending: only when it differs from what the thread runs. */
function choiceToSend(threadId: string): ModelChoice | undefined {
  const picked = state.choices[threadId]
  if (!picked) return undefined
  const summary = state.summaries.find((s) => s.threadId === threadId)
  if (
    summary &&
    summary.driver === picked.driver &&
    summary.model === picked.model &&
    JSON.stringify(summary.options ?? {}) === JSON.stringify(picked.options ?? {})
  ) {
    return undefined
  }
  return picked
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export async function send(threadId: string, text: string, files: FileRef[] = []) {
  const trimmed = text.trim()
  if (!trimmed && files.length === 0) return
  const t = state.threads[threadId]
  const choice = choiceToSend(threadId)

  // A busy agent gets the message when its turn ends, like the desktop queue.
  if (t?.busy || t?.sending) {
    patchThread(threadId, (th) => ({
      ...th,
      queued: [...th.queued, { id: `q-${Date.now()}`, text: trimmed, files, choice }],
    }))
    return
  }
  await dispatch(threadId, trimmed, files, choice)
}

async function dispatch(threadId: string, text: string, files: FileRef[], choice?: ModelChoice) {
  const stamp = Date.now()
  patchThread(threadId, (th) => ({
    ...th,
    sending: true,
    blocks: [...th.blocks, userBlock(text, `user-local-${stamp}`, files.map((f) => ({ path: f.path, mime: f.mime })), stamp)],
  }))
  try {
    await api.send(threadId, text, files, choice)
    patchThread(threadId, (th) => ({ ...th, sending: false }))
  } catch (e) {
    patchThread(threadId, (th) => ({
      ...th,
      sending: false,
      blocks: [
        ...th.blocks,
        { type: 'text', id: `send-error-${stamp}`, content: `Not sent: ${message(e)}`, variant: 'error', timestamp: Date.now() },
      ],
    }))
  }
}

async function drainQueue(threadId: string) {
  const t = state.threads[threadId]
  if (!t || t.queued.length === 0 || t.busy) return
  const [next, ...rest] = t.queued
  patchThread(threadId, (th) => ({ ...th, queued: rest }))
  await dispatch(threadId, next.text, next.files, next.choice)
}

export function removeQueued(threadId: string, id: string) {
  patchThread(threadId, (th) => ({ ...th, queued: th.queued.filter((q) => q.id !== id) }))
}

export async function interrupt(threadId: string) {
  try {
    await api.interrupt(threadId)
  } catch {
    /* the turn may already be over */
  }
}

// ---------------------------------------------------------------------------
// Socket
// ---------------------------------------------------------------------------

let socket: WebSocket | null = null
let backoff = 1000
let reconnectTimer: number | undefined
let started = false

function wsUrl(): string {
  const base = getBase()
  const token = getToken()
  const suffix = token ? `/api/ws?token=${encodeURIComponent(token)}` : '/api/ws'
  if (base && /^https?:\/\//.test(base)) {
    const u = new URL(base)
    return `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}${suffix}`
  }
  return `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${suffix}`
}

function connect() {
  window.clearTimeout(reconnectTimer)
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return
  set({ connection: 'connecting' })
  try {
    socket = new WebSocket(wsUrl())
  } catch {
    retry()
    return
  }
  socket.onopen = () => {
    backoff = 1000
    set({ connection: 'live' })
    // Anything missed while disconnected comes back through fresh snapshots.
    void refreshSummaries()
    for (const [threadId, t] of Object.entries(state.threads)) {
      if (t.loaded) void loadThread(threadId, true)
    }
  }
  socket.onmessage = (event) => {
    let msg: ServerMessage
    try {
      msg = JSON.parse(event.data)
    } catch {
      return
    }
    if (msg.type === 'events' && msg.events) applyEvents(msg.events)
    else if (msg.type === 'event' && msg.event) applyEvents([msg.event])
  }
  socket.onclose = () => {
    socket = null
    set({ connection: 'offline' })
    retry()
  }
  socket.onerror = () => socket?.close()
}

function retry() {
  window.clearTimeout(reconnectTimer)
  reconnectTimer = window.setTimeout(connect, backoff)
  backoff = Math.min(backoff * 2, 10000)
}

/** Starts the socket and the background refresh; safe to call repeatedly. */
export function startSync() {
  if (started) return
  started = true
  connect()
  void refreshSummaries()
  void loadProviders()
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void refreshSummaries()
  }, 15000)
  // iOS suspends sockets in the background; reconnect the moment we return.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    backoff = 1000
    if (!socket || socket.readyState !== WebSocket.OPEN) connect()
    else void refreshSummaries()
  })
  window.addEventListener('online', () => {
    backoff = 1000
    connect()
  })
}

export function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
