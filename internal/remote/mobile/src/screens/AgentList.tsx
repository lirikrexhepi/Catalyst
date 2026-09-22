import React, { useEffect, useState } from 'react'
import { Screen, RemoteAgentView } from '../types'
import { api } from '../api'
import NavHeader from '../components/NavHeader'
import Row from '../components/Row'
import Avatar from '../components/Avatar'
import StatusPill from '../components/StatusPill'

interface Props {
  projectPath: string
  projectName: string
  push: (s: Screen) => void
  pop: () => void
}

export default function AgentList({ projectPath, projectName, push, pop }: Props) {
  const [agents, setAgents] = useState<RemoteAgentView[]>([])

  useEffect(() => {
    let mounted = true
    const fetchAgents = async () => {
      try {
        const allAgents = await api.agents()
        if (mounted) {
          const filtered = allAgents.filter(a => a.cwd === projectPath)
          filtered.sort((a, b) => {
            if (a.state === 'running' && b.state !== 'running') return -1
            if (a.state !== 'running' && b.state === 'running') return 1
            return a.threadId.localeCompare(b.threadId)
          })
          setAgents(filtered)
        }
      } catch (e) {
        console.error(e)
      }
    }
    fetchAgents()
    const interval = setInterval(fetchAgents, 3000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [projectPath])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <NavHeader title={projectName} onBack={pop} />
      
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <Row 
          avatar={<Avatar name="C" active />}
          title="Coordinator"
          subtitle="Send task to this project"
          onClick={() => push({ id: 'coordinator', projectPath, projectName })}
        />

        {agents.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-mut)', fontSize: 14 }}>
            No agents in this project
          </div>
        ) : (
          agents.map(a => (
            <Row
              key={a.threadId}
              avatar={<Avatar name={a.title} active={a.state === 'running'} />}
              title={a.title}
              subtitle={
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{a.model}</span>
                  <span>•</span>
                  <StatusPill state={a.state} />
                </div>
              }
              timestamp={a.branch}
              onClick={() => push({ id: 'agent-chat', threadId: a.threadId, title: a.title, cwd: a.cwd })}
            />
          ))
        )}
      </div>
    </div>
  )
}
