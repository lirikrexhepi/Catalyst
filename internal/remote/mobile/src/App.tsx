import React, { useState, useCallback, useEffect } from 'react'
import { Screen } from './types'
import { api, getToken } from './api'
import { useWebSocket } from './ws'
import AuthScreen from './screens/Auth'
import ProjectList from './screens/ProjectList'
import AgentList from './screens/AgentList'
import AgentChat from './screens/AgentChat'
import CoordinatorChat from './screens/CoordinatorChat'
import SettingsScreen from './screens/SettingsScreen'
import TabBar, { TabId } from './components/TabBar'

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [tab, setTab] = useState<TabId>('chats')
  const [stack, setStack] = useState<Screen[]>([])
  const ws = useWebSocket()

  const checkAuth = useCallback(() => {
    setAuthenticated(null)
    getToken()
    api.status().then(s => {
      setAuthenticated(s.authenticated !== false)
    }).catch(() => setAuthenticated(false))
  }, [])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const push = useCallback((screen: Screen) => {
    setStack(prev => [...prev, screen])
  }, [])

  const pop = useCallback(() => {
    setStack(prev => prev.length > 1 ? prev.slice(0, -1) : prev)
  }, [])

  const switchTab = useCallback((t: TabId) => {
    setTab(t)
    setStack([])
  }, [])

  if (authenticated === null) return <div style={{ background: 'var(--bg-main)', height: '100dvh' }} />
  if (authenticated === false) return <AuthScreen onDone={checkAuth} />

  const top = stack[stack.length - 1]

  return (
    <div className="screen-stack">
      {top ? (
        <div className="screen current">
          {top.id === 'agents' && (
            <AgentList push={push} pop={pop} projectPath={top.projectPath} projectName={top.projectName} />
          )}
          {top.id === 'coordinator' && (
            <CoordinatorChat pop={pop} wsLastMessage={ws.lastMessage} wsSend={ws.send} wsConnected={ws.connected} projectName={top.projectName} />
          )}
          {top.id === 'agent-chat' && (
            <AgentChat pop={pop} wsLastMessage={ws.lastMessage} wsSend={ws.send} wsConnected={ws.connected} threadId={top.threadId} title={top.title} />
          )}
        </div>
      ) : (
        <div className="screen current" style={{ paddingBottom: 0 }}>
          {tab === 'chats' && <ProjectList push={push} />}
          {tab === 'coordinator' && (
            <CoordinatorChat
              pop={() => undefined}
              wsLastMessage={ws.lastMessage}
              wsSend={ws.send}
              wsConnected={ws.connected}
              hideBack
            />
          )}
          {tab === 'settings' && <SettingsScreen />}
          <TabBar active={tab} onChange={switchTab} />
        </div>
      )}
    </div>
  )
}
