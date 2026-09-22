import React, { useState, useCallback, useEffect } from 'react'
import { api, getToken } from './api'
import { Project } from './types'
import { useWebSocket } from './ws'
import AuthScreen from './screens/Auth'
import ProjectView from './screens/ProjectList'
import AgentChat from './screens/AgentChat'
import CoordinatorChat from './screens/CoordinatorChat'
import SettingsScreen from './screens/SettingsScreen'
import TopBar from './components/TopBar'
import Drawer, { Selection } from './components/Drawer'

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selection, setSelection] = useState<Selection>({ kind: 'coordinator' })
  const [projects, setProjects] = useState<Project[]>([])
  const [chatKey, setChatKey] = useState(0)
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

  useEffect(() => {
    if (authenticated !== true) return
    let mounted = true
    const load = async () => {
      try {
        const projs = await api.projects()
        if (mounted) setProjects(Array.isArray(projs) ? projs : [])
      } catch { /* retry next poll */ }
    }
    load()
    const interval = setInterval(load, 4000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [authenticated])

  const newChat = useCallback(async () => {
    try {
      await api.newCoordinator()
    } catch { /* local reset still applies */ }
    setSelection({ kind: 'coordinator' })
    setChatKey(k => k + 1)
  }, [])

  if (authenticated === null) return <div style={{ background: 'var(--bg-main)', height: '100dvh' }} />
  if (authenticated === false) return <AuthScreen onDone={checkAuth} />

  const title =
    selection.kind === 'coordinator' ? 'Orchestrator' :
    selection.kind === 'project' ? selection.name :
    selection.kind === 'agent' ? selection.title :
    'Settings'

  const inChat = selection.kind === 'coordinator' || selection.kind === 'agent'

  return (
    <div className="screen-stack" style={{ overflowX: 'clip' }}>
      <div className="screen current" style={{ display: 'flex', flexDirection: 'column' }}>
        <TopBar
          title={title}
          onMenu={() => setDrawerOpen(true)}
          onNewChat={selection.kind === 'coordinator' ? () => void newChat() : undefined}
          live={inChat ? ws.connected : undefined}
        />

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {selection.kind === 'coordinator' && (
            <CoordinatorChat
              key={chatKey}
              pop={() => setDrawerOpen(true)}
              wsLastMessage={ws.lastMessage}
              wsSend={ws.send}
              wsConnected={ws.connected}
              hideBack
              bare
            />
          )}
          {selection.kind === 'project' && (
            <ProjectView
              projectPath={selection.path}
              projectName={selection.name}
              onOpenAgent={(threadId, agentTitle) => setSelection({ kind: 'agent', threadId, title: agentTitle })}
              onOpenCoordinator={() => setSelection({ kind: 'coordinator' })}
            />
          )}
          {selection.kind === 'agent' && (
            <AgentChat
              pop={() => setDrawerOpen(true)}
              wsLastMessage={ws.lastMessage}
              wsSend={ws.send}
              wsConnected={ws.connected}
              threadId={selection.threadId}
              title={selection.title}
              bare
            />
          )}
          {selection.kind === 'settings' && <SettingsScreen bare />}
        </div>

        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          projects={projects}
          selection={selection}
          onSelect={setSelection}
          onNewChat={() => void newChat()}
        />
      </div>
    </div>
  )
}
