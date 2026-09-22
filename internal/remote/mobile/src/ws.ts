import { useEffect, useRef, useCallback, useState } from 'react'
import { ServerMessage } from './types'
import { getToken, getBase } from './api'

function wsUrl(): string {
  const base = getBase()
  const token = getToken()
  const suffix = token ? `/api/ws?token=${encodeURIComponent(token)}` : '/api/ws'
  if (base && /^https?:\/\//.test(base)) {
    const u = new URL(base)
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${u.origin}${suffix}`
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${suffix}`
}

export function useWebSocket() {
  const [lastMessage, setLastMessage] = useState<ServerMessage | null>(null)
  const [connected, setConnected] = useState(false)
  const ws = useRef<WebSocket | null>(null)
  const reconnectTimeout = useRef<number>()
  const backoff = useRef(1000)

  const connect = useCallback(() => {
    try {
      ws.current = new WebSocket(wsUrl())
    } catch {
      reconnectTimeout.current = window.setTimeout(connect, backoff.current)
      return
    }

    ws.current.onopen = () => {
      setConnected(true)
      backoff.current = 1000
    }

    ws.current.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage
        setLastMessage(msg)
      } catch {
        /* ignore malformed frames */
      }
    }

    ws.current.onclose = () => {
      setConnected(false)
      ws.current = null
      reconnectTimeout.current = window.setTimeout(connect, backoff.current)
      backoff.current = Math.min(backoff.current * 2, 10000)
    }

    ws.current.onerror = () => {
      ws.current?.close()
    }
  }, [])

  useEffect(() => {
    connect()
    const onStorage = () => {
      if (ws.current) {
        ws.current.onclose = null
        ws.current.close()
      }
      clearTimeout(reconnectTimeout.current)
      connect()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
      clearTimeout(reconnectTimeout.current)
      if (ws.current) {
        ws.current.onclose = null
        ws.current.close()
      }
    }
  }, [connect])

  const send = useCallback((msg: object) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(msg))
      return true
    }
    return false
  }, [])

  return { lastMessage, send, connected }
}
