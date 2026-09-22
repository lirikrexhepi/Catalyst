import { RemoteAgentView, RemoteStatus, RuntimeEvent } from './types'

const TOKEN_KEY = 'composer_remote_token'
const BASE_KEY = 'composer_remote_base'

export function getToken(): string {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('token')
    if (fromUrl) {
      localStorage.setItem(TOKEN_KEY, fromUrl)
      return fromUrl
    }
  } catch { /* ignore */ }
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function setToken(token: string) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* ignore */ }
}

export function getBase(): string {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('server')
    if (fromUrl) {
      localStorage.setItem(BASE_KEY, fromUrl.replace(/\/$/, ''))
      return fromUrl.replace(/\/$/, '')
    }
  } catch { /* ignore */ }
  try {
    return localStorage.getItem(BASE_KEY) || ''
  } catch {
    return ''
  }
}

export function applyScannedLink(link: string): boolean {
  const text = link.trim()
  if (!text) return false
  try {
    const u = new URL(text)
    const token = u.searchParams.get('token') || ''
    if (!token) {
      if (/^[0-9a-f]{32,}$/i.test(text)) {
        setToken(text)
        return true
      }
      return false
    }
    setBase(`${u.protocol}//${u.host}`)
    setToken(token)
    return true
  } catch {
    if (/^[0-9a-f]{32,}$/i.test(text)) {
      setToken(text)
      return true
    }
    return false
  }
}

export function setBase(base: string) {
  try {
    if (base) localStorage.setItem(BASE_KEY, base.replace(/\/$/, ''))
    else localStorage.removeItem(BASE_KEY)
  } catch { /* ignore */ }
}

function url(path: string): string {
  const base = getBase()
  const token = getToken()
  const sep = path.includes('?') ? '&' : '?'
  const withAuth = token ? `${path}${sep}token=${encodeURIComponent(token)}` : path
  if (!base) return withAuth
  if (/^https?:\/\//.test(base)) return `${base}${withAuth}`
  return withAuth
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(url(path), {
    credentials: 'same-origin',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  })
  if (!res.ok) {
    let detail = `${res.status}`
    try {
      const body = await res.json()
      if (body && typeof body.error === 'string' && body.error) detail = body.error
    } catch { /* ignore */ }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

export const api = {
  status: () => request<{ authenticated?: boolean } & Partial<RemoteStatus>>('/api/status'),
  agents: () => request<RemoteAgentView[]>('/api/agents'),
  history: () => request<RuntimeEvent[]>('/api/history'),
  agentHistory: (threadId: string) => request<RuntimeEvent[]>(`/api/agent/${encodeURIComponent(threadId)}/history`),
  sendCoordinator: (text: string) =>
    request<{ turnId: string }>('/api/coordinator/send', { method: 'POST', body: JSON.stringify({ text }) }),
  interruptCoordinator: () =>
    request('/api/coordinator/interrupt', { method: 'POST', body: '{}' }),
  newCoordinator: () =>
    request('/api/coordinator/new', { method: 'POST', body: '{}' }),
  sendAgent: (threadId: string, text: string) =>
    request<{ turnId: string }>('/api/agent/send', { method: 'POST', body: JSON.stringify({ threadId, text }) }),
  stopAgent: (threadId: string) =>
    request('/api/agent/stop', { method: 'POST', body: JSON.stringify({ threadId }) }),
  approve: (threadId: string, requestId: string, decision: string) =>
    request('/api/approve', { method: 'POST', body: JSON.stringify({ threadId, requestId, decision }) }),
  answerQuestion: (threadId: string, requestId: string, answers: string[]) =>
    request('/api/question/answer', { method: 'POST', body: JSON.stringify({ threadId, requestId, answers }) }),
}
