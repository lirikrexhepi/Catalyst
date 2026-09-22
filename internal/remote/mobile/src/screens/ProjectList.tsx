import React, { useEffect, useState } from 'react'
import { RemoteAgentView } from '../types'
import { api } from '../api'
import Row from '../components/Row'
import Avatar from '../components/Avatar'

interface Props {
  projectPath: string
  projectName: string
  onOpenAgent: (threadId: string, title: string) => void
  onOpenCoordinator: () => void
}

function statusLabel(a: RemoteAgentView): string {
  const bits = [a.model]
  if (a.branch) bits.push(a.branch)
  switch (a.state) {
    case 'running': bits.push(a.live ? 'active now' : 'running'); break
    case 'complete': bits.push('finished'); break
    case 'failed': bits.push('failed'); break
    case 'pending': bits.push('starting'); break
    case 'closed': bits.push('closed'); break
    default: bits.push(a.state)
  }
  return bits.filter(Boolean).join(' · ')
}

export default function ProjectList({ projectPath, onOpenAgent, onOpenCoordinator }: Props) {
  const [agents, setAgents] = useState<RemoteAgentView[]>([])

  useEffect(() => {
    let mounted = true
    const fetchAgents = async () => {
      try {
        const projs = await api.projects()
        if (mounted) {
          const proj = projs.find(p => p.path === projectPath)
          const list = (proj?.agents ?? []).slice()
          list.sort((a, b) => {
            const ar = a.live && a.state === 'running' ? 0 : 1
            const br = b.live && b.state === 'running' ? 0 : 1
            if (ar !== br) return ar - br
            return a.threadId.localeCompare(b.threadId)
          })
          setAgents(list)
        }
      } catch { /* keep previous */ }
    }
    fetchAgents()
    const interval = setInterval(fetchAgents, 3000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [projectPath])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: 24 }}>
        <Row
          avatar={<Avatar name="Coordinator" size={48} />}
          title="Coordinator"
          subtitle="Send task to this project"
          onClick={onOpenCoordinator}
        />

        <div style={{ padding: '10px 16px 4px', fontSize: 12.5, fontWeight: 700, color: 'var(--text-mut)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Agents · {agents.length}
        </div>

        {agents.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-mut)', fontSize: 14 }}>
            No agents in this project
          </div>
        ) : (
          agents.map(a => (
            <Row
              key={a.threadId}
              avatar={<Avatar name={a.title} size={48} active={a.live && a.state === 'running'} />}
              title={a.title}
              subtitle={statusLabel(a)}
              timestamp={a.branch}
              badge={a.live && a.state === 'running' ? 1 : 0}
              onClick={() => onOpenAgent(a.threadId, a.title)}
            />
          ))
        )}
      </div>
    </div>
  )
}
