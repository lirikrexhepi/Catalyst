import { api, type PhoneLogPayloadItem } from './api'
import { readLocal, writeLocal } from './cache'

const UNSENT_KEY = 'orchestrator_unsent_phone_logs'
const MAX_PENDING = 80
const MAX_RECENT = 120

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export interface PhoneLogEntry extends PhoneLogPayloadItem {
  id: string
}

let pendingLogs: PhoneLogEntry[] = readLocal<PhoneLogEntry[]>(UNSENT_KEY, [])
const recentLogs: PhoneLogEntry[] = [...pendingLogs].slice(-MAX_RECENT)
let flushing = false
let socketSender: ((logs: PhoneLogPayloadItem[]) => boolean) | null = null
let agentRunning = false
let flushTimer: number | undefined
let installed = false

function deviceId(): string {
  let id = localStorage.getItem('orchestrator_phone_id')
  if (!id) {
    id = 'phone-' + Math.random().toString(36).slice(2, 10)
    try {
      localStorage.setItem('orchestrator_phone_id', id)
    } catch {
      /* ignore */
    }
  }
  return id
}

export function setSocketSender(sender: ((logs: PhoneLogPayloadItem[]) => boolean) | null) {
  socketSender = sender
}

export function setAgentRunningState(running: boolean) {
  if (agentRunning !== running) {
    agentRunning = running
    if (running) {
      logPhoneInfo('Agent activity detected on mobile client')
      void flushPhoneLogs()
    }
  }
}

export function logPhone(level: LogLevel, message: string, details?: Record<string, unknown>) {
  const entry: PhoneLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    level,
    message,
    details: details ? sanitizeDetails(details) : undefined,
  }

  // Keep in memory and pending queue
  recentLogs.push(entry)
  if (recentLogs.length > MAX_RECENT) recentLogs.shift()

  pendingLogs.push(entry)
  if (pendingLogs.length > MAX_PENDING) pendingLogs.shift()
  writeLocal(UNSENT_KEY, pendingLogs)

  // Flush immediately on errors, warnings, or while agents are running
  if (level === 'error' || level === 'warn' || agentRunning) {
    scheduleFlush(500)
  } else {
    scheduleFlush(5000)
  }
}

export const logPhoneInfo = (msg: string, details?: Record<string, unknown>) => logPhone('info', msg, details)
export const logPhoneWarn = (msg: string, details?: Record<string, unknown>) => logPhone('warn', msg, details)
export const logPhoneError = (msg: string, details?: Record<string, unknown>) => logPhone('error', msg, details)

function sanitizeDetails(d: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(d)) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      clean[k] = v
    } else if (v instanceof Error) {
      clean[k] = `${v.name}: ${v.message}`
    } else {
      try {
        clean[k] = JSON.parse(JSON.stringify(v))
      } catch {
        clean[k] = String(v)
      }
    }
  }
  return clean
}

export function scheduleFlush(delayMs = 2000) {
  window.clearTimeout(flushTimer)
  flushTimer = window.setTimeout(() => void flushPhoneLogs(), delayMs)
}

export async function flushPhoneLogs(options?: { keepalive?: boolean }) {
  if (flushing || pendingLogs.length === 0) return
  flushing = true

  const batch = [...pendingLogs]
  const batchIds = new Set(batch.map((b) => b.id))

  // 1. Try socket sender if available and online
  if (socketSender) {
    try {
      const ok = socketSender(batch)
      if (ok) {
        pendingLogs = pendingLogs.filter((p) => !batchIds.has(p.id))
        writeLocal(UNSENT_KEY, pendingLogs)
        flushing = false
        return
      }
    } catch {
      // Fall back to HTTP
    }
  }

  // 2. Try HTTP endpoint
  try {
    const res = await api.sendPhoneLogs(batch, deviceId())
    if (res && res.ok) {
      pendingLogs = pendingLogs.filter((p) => !batchIds.has(p.id))
      writeLocal(UNSENT_KEY, pendingLogs)
    }
  } catch {
    // Keep pending logs in local storage; will retry on next flush / reconnect
  } finally {
    flushing = false
  }
}

export function initPhoneLogger() {
  if (installed || typeof window === 'undefined') return
  installed = true

  // Capture basic device context
  const conn = (navigator as unknown as { connection?: { effectiveType?: string; downlink?: number; rtt?: number } }).connection
  const netDetails: Record<string, unknown> = {
    onLine: navigator.onLine,
    userAgent: navigator.userAgent.slice(0, 120),
  }
  if (conn) {
    netDetails.effectiveType = conn.effectiveType
    netDetails.downlink = conn.downlink
    netDetails.rtt = conn.rtt
  }
  logPhoneInfo('Mobile app session initialized', netDetails)

  // Listen to network transitions
  window.addEventListener('online', () => {
    logPhoneInfo('Phone reconnected to network (online = true)')
    void flushPhoneLogs()
  })
  window.addEventListener('offline', () => {
    logPhoneWarn('Phone lost network connection (online = false)')
  })

  // Listen to visibility & lifecycle changes
  document.addEventListener('visibilitychange', () => {
    const state = document.visibilityState
    if (state === 'hidden') {
      logPhoneInfo('App visibility changed to hidden (screen off or backgrounded)', { agentRunning })
      void flushPhoneLogs({ keepalive: true })
    } else {
      logPhoneInfo('App visibility changed to visible', { agentRunning })
      void flushPhoneLogs()
    }
  })

  window.addEventListener('pagehide', () => {
    logPhoneInfo('Page hide triggered', { agentRunning })
    void flushPhoneLogs({ keepalive: true })
  })

  // Unhandled errors
  window.addEventListener('error', (event) => {
    logPhoneError(`Unhandled error: ${event.message}`, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason)
    logPhoneError(`Unhandled promise rejection: ${reason}`)
  })

  // Periodic flush timer (more frequent when agents are running)
  window.setInterval(() => {
    if (pendingLogs.length > 0) {
      void flushPhoneLogs()
    }
  }, agentRunning ? 4000 : 20000)
}
