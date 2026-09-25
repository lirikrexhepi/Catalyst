import type { FileRef, ModelChoice, PreviewInfo, Project, ProviderInfo, RuntimeEvent, ServerGroup, ThreadSummary } from './types'
import type { Checkout, DiffFile, FileContent, FolderListing, Place, TreeEntry, TreeStatus } from './workspaceTypes'

const q = (params: Record<string, string>) => new URLSearchParams(params).toString()

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
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 20000)
  try {
    const res = await fetch(url(path), {
      credentials: 'same-origin',
      signal: options?.signal || controller.signal,
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options?.headers ?? {}),
      },
    })
    clearTimeout(timeoutId)
    if (!res.ok) {
      let detail = `${res.status}`
      try {
        const body = await res.json()
        if (body && typeof body.error === 'string' && body.error) detail = body.error
      } catch { /* ignore */ }
      // Marked so callers can tell a server answer (do not retry the send)
      // from a network failure (safe to retry over the socket).
      throw Object.assign(new Error(detail), { status: res.status })
    }
    return res.json() as Promise<T>
  } catch (e) {
    clearTimeout(timeoutId)
    throw e
  }
}

/** True when the request never got an HTTP answer, so a retry cannot double-send. */
export function isNetworkError(e: unknown): boolean {
  return !(e && typeof e === 'object' && 'status' in e)
}

export const api = {
  status: () => request<{ authenticated?: boolean; canPowerOff?: boolean }>('/api/status'),
  shutdownPC: () =>
    request<{ ok?: boolean }>('/api/system/shutdown', { method: 'POST', body: JSON.stringify({ confirm: 'shutdown' }) }),
  threads: () => request<ThreadSummary[]>('/api/threads'),
  thread: (threadId: string) =>
    request<{ events: RuntimeEvent[]; lastSeq: number }>(`/api/thread/${encodeURIComponent(threadId)}`),
  projects: () => request<Project[]>('/api/projects'),
  models: (refresh = false) => request<ProviderInfo[]>(`/api/models${refresh ? '?refresh=1' : ''}`),
  send: (threadId: string, text: string, files: FileRef[], choice?: ModelChoice) =>
    request<{ ok?: boolean; turnId?: string }>('/api/send', {
      method: 'POST',
      body: JSON.stringify({ threadId, text, files, choice }),
    }),
  interrupt: (threadId: string) =>
    request('/api/interrupt', { method: 'POST', body: JSON.stringify({ threadId }) }),
  endAgent: (threadId: string) =>
    request('/api/agent/stop', { method: 'POST', body: JSON.stringify({ threadId }) }),
  newConversation: () => request('/api/coordinator/new', { method: 'POST', body: '{}' }),
  newAgent: (body: { prompt: string; cwd: string; choice: ModelChoice; autoApprove: boolean }) =>
    request<{ threadId: string }>('/api/agent/new', { method: 'POST', body: JSON.stringify(body) }),
  approve: (threadId: string, requestId: string, decision: string) =>
    request('/api/approve', { method: 'POST', body: JSON.stringify({ threadId, requestId, decision }) }),
  answer: (threadId: string, requestId: string, answers: string[]) =>
    request('/api/question/answer', { method: 'POST', body: JSON.stringify({ threadId, requestId, answers }) }),
  upload: (name: string, mime: string, data: string) =>
    request<FileRef>('/api/upload', { method: 'POST', body: JSON.stringify({ name, mime, data }) }),
  servers: () => request<ServerGroup[]>('/api/servers'),
  previewStart: (port: number) =>
    request<PreviewInfo>('/api/preview/start', { method: 'POST', body: JSON.stringify({ port }) }),
  // Project explorer, diffs and the folder picker.
  gitOverview: (project: string) => request<Checkout[]>(`/api/git/overview?${q({ project })}`),
  gitDiff: (checkout: string, file: string, staged: boolean) =>
    request<DiffFile>(`/api/git/diff?${q({ checkout, file, staged: staged ? '1' : '0' })}`),
  gitCommit: (checkout: string, sha: string) => request<DiffFile[]>(`/api/git/commit?${q({ checkout, sha })}`),
  tree: (root: string, dir: string) => request<TreeEntry[]>(`/api/tree?${q({ root, dir })}`),
  treeStatus: (root: string) => request<TreeStatus>(`/api/tree/status?${q({ root })}`),
  file: (root: string, path: string) => request<FileContent>(`/api/file?${q({ root, path })}`),
  places: () => request<{ places: Place[] }>('/api/folders'),
  folder: (path: string) => request<{ folder: FolderListing }>(`/api/folders?${q({ path })}`),
  addProject: (path: string) =>
    request<Project>('/api/projects/add', { method: 'POST', body: JSON.stringify({ path }) }),
  previewStop: (port: number) =>
    request<{ ok?: boolean }>('/api/preview/stop', { method: 'POST', body: JSON.stringify({ port }) }),
  pushKey: () => request<{ publicKey: string }>('/api/push/key'),
  pushSubscribe: (subscription: PushSubscriptionJSON, prefs: PushPrefs) =>
    request<{ ok?: boolean }>('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription, prefs }) }),
  pushUnsubscribe: (endpoint: string) =>
    request<{ ok?: boolean }>('/api/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) }),
  pushTest: (endpoint: string) =>
    request<{ ok?: boolean }>('/api/push/test', { method: 'POST', body: JSON.stringify({ endpoint }) }),
}

export interface PushPrefs {
  attention: boolean
  finished: boolean
  away: boolean
}
