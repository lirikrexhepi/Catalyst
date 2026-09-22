import React, { useState, useCallback, useEffect } from 'react'
import { Screen } from './types'
import { api, getToken } from './api'
import { useWebSocket } from './ws'
import AuthScreen from './screens/Auth'
import ProjectList from './screens/ProjectList'
import AgentList from './screens/AgentList'
import AgentChat from './screens/AgentChat'
import CoordinatorChat from './screens/CoordinatorChat'

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [stack, setStack] = useState<Screen[]>([{ id: 'projects' }])
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

  if (authenticated === null) return <div style={{ background: 'var(--bg-main)', height: '100dvh' }} />
  if (authenticated === false) return <AuthScreen onDone={checkAuth} />

  return (
    <div className="screen-stack">
      {stack.map((screen, index) => {
        if (index < stack.length - 2) return null

        let className = 'screen'
        if (index === stack.length - 1) {
          className += ' current'
        } else if (index === stack.length - 2) {
          className += ' prev'
        } else {
          className += ' next'
        }

        const screenContent = () => {
          switch (screen.id) {
            case 'projects':
              return <ProjectList push={push} />
            case 'agents':
              return <AgentList push={push} pop={pop} projectPath={screen.projectPath} projectName={screen.projectName} />
            case 'coordinator':
              return <CoordinatorChat pop={pop} wsLastMessage={ws.lastMessage} wsSend={ws.send} wsConnected={ws.connected} projectName={screen.projectName} />
            case 'agent-chat':
              return <AgentChat pop={pop} wsLastMessage={ws.lastMessage} wsSend={ws.send} wsConnected={ws.connected} threadId={screen.threadId} title={screen.title} />
          }
        }

        return (
          <div key={`${screen.id}-${index}`} className={className}>
            {screenContent()}
          </div>
        )
      })}
    </div>
  )
}
