import type { AgentStreamBlock } from './feed/types'

export interface CachedThread {
  id: string
  blocks: AgentStreamBlock[]
  lastSeq: number
  turnMs: Record<string, number>
  savedAt: number
}

const DB_NAME = 'orchestrator-cache'
const STORE = 'threads'
const MAX_THREADS = 40
const MAX_BLOCKS = 400

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    return
  }
}

let dbPromise: Promise<IDBDatabase | null> | null = null

function db(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

function done<T>(req: IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(undefined)
  })
}

export async function readThread(id: string): Promise<CachedThread | undefined> {
  const conn = await db()
  if (!conn) return undefined
  try {
    return await done(conn.transaction(STORE, 'readonly').objectStore(STORE).get(id) as IDBRequest<CachedThread>)
  } catch {
    return undefined
  }
}

let writes = 0

export async function writeThread(entry: Omit<CachedThread, 'savedAt'>) {
  const conn = await db()
  if (!conn) return
  const blocks = entry.blocks.filter((b) => !(b.type === 'user' && b.pending)).slice(-MAX_BLOCKS)
  try {
    conn.transaction(STORE, 'readwrite').objectStore(STORE).put({ ...entry, blocks, savedAt: Date.now() })
  } catch {
    return
  }
  writes++
  if (writes % 10 === 1) void prune(conn)
}

async function prune(conn: IDBDatabase) {
  try {
    const all = await done(conn.transaction(STORE, 'readonly').objectStore(STORE).getAll() as IDBRequest<CachedThread[]>)
    if (!all || all.length <= MAX_THREADS) return
    const stale = all.sort((a, b) => b.savedAt - a.savedAt).slice(MAX_THREADS)
    const store = conn.transaction(STORE, 'readwrite').objectStore(STORE)
    for (const t of stale) store.delete(t.id)
  } catch {
    return
  }
}
