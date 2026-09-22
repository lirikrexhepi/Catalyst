import React, { useCallback, useEffect, useState } from 'react'
import { api, getToken } from './api'
import { startSync } from './store'
import AuthScreen from './screens/Auth'
import Inbox from './screens/Inbox'
import Thread from './screens/Thread'

/** #/t/<threadId> opens a conversation; anything else is the inbox. */
function routeFromHash(): string | null {
  const m = window.location.hash.match(/^#\/t\/(.+)$/)
  return m ? decodeURIComponent(m[1]) : null
}

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [threadId, setThreadId] = useState<string | null>(routeFromHash())

  const checkAuth = useCallback(() => {
    setAuthenticated(null)
    getToken()
    api
      .status()
      .then((s) => setAuthenticated(s.authenticated !== false))
      .catch(() => setAuthenticated(false))
  }, [])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    if (authenticated) startSync()
  }, [authenticated])

  // The hash drives navigation so iOS back swipes and the back button work.
  useEffect(() => {
    const onHash = () => setThreadId(routeFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const open = useCallback((id: string) => {
    window.location.hash = `#/t/${encodeURIComponent(id)}`
  }, [])
  const back = useCallback(() => {
    if (window.history.length > 1 && routeFromHash()) window.history.back()
    else window.location.hash = ''
  }, [])

  if (authenticated === null) return <div className="screen" />
  if (authenticated === false) return <AuthScreen onDone={checkAuth} />
  if (threadId) return <Thread key={threadId} threadId={threadId} back={back} />
  return <Inbox open={open} />
}
