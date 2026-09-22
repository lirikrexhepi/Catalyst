import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import type { ServerGroup } from './types'

/**
 * Dev servers on the PC with their public preview tunnels. Polled while a
 * screen using it is mounted; Share spins a tunnel up, the poll picks up the
 * URL once Cloudflare hands it out.
 */
export function useServers(pollMs = 10000) {
  const [groups, setGroups] = useState<ServerGroup[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Record<number, boolean>>({})
  const timer = useRef<number | undefined>(undefined)

  const refresh = useCallback(async () => {
    try {
      const next = await api.servers()
      setGroups(Array.isArray(next) ? next : [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
    timer.current = window.setInterval(() => void refresh(), pollMs)
    return () => window.clearInterval(timer.current)
  }, [refresh, pollMs])

  const mark = useCallback((port: number, on: boolean) => {
    setPending((p) => {
      if (!on) {
        const { [port]: _drop, ...rest } = p
        return rest
      }
      return { ...p, [port]: true }
    })
  }, [])

  const start = useCallback(
    async (port: number) => {
      mark(port, true)
      try {
        await api.previewStart(port)
        await refresh()
      } finally {
        mark(port, false)
      }
    },
    [mark, refresh],
  )

  const stop = useCallback(
    async (port: number) => {
      mark(port, true)
      try {
        await api.previewStop(port)
        await refresh()
      } finally {
        mark(port, false)
      }
    },
    [mark, refresh],
  )

  return { groups, loaded, error, pending, refresh, start, stop }
}

export function serversForThread(groups: ServerGroup[], threadId: string) {
  const out: ServerGroup['servers'] = []
  for (const g of groups) {
    for (const s of g.servers) {
      if (s.ownerThreadId === threadId || g.threadId === threadId) out.push(s)
    }
  }
  return out
}
