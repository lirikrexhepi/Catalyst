import React, { useEffect, useState } from 'react'
import { Screen, Project, RuntimeEvent } from '../types'
import { api } from '../api'
import { groupAgentsByProject, formatRelative } from '../utils'
import NavHeader from '../components/NavHeader'
import Row from '../components/Row'
import Avatar from '../components/Avatar'

interface Props {
  push: (s: Screen) => void
}

export default function ProjectList({ push }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [coordinatorEvent, setCoordinatorEvent] = useState<RuntimeEvent | null>(null)

  useEffect(() => {
    let mounted = true
    const fetchData = async () => {
      try {
        const [agents, history] = await Promise.all([
          api.agents(),
          api.history().catch(() => [])
        ])
        if (mounted) {
          setProjects(groupAgentsByProject(agents))
          if (history && history.length > 0) {
            setCoordinatorEvent(history[history.length - 1])
          }
          setLoading(false)
        }
      } catch {
        if (mounted) setLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 3000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <NavHeader title="Chats" large />

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 110 }}>
        <div className="rise">
          <Row
            avatar={<Avatar name="Coordinator" />}
            title="Coordinator"
            subtitle={coordinatorEvent?.text || 'Global orchestrator'}
            timestamp={coordinatorEvent ? formatRelative(coordinatorEvent.at) : undefined}
            ticks={!!coordinatorEvent}
            onClick={() => push({ id: 'coordinator' })}
          />
        </div>

        <div style={{ height: 8 }} />

        {loading && projects.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-mut)', fontSize: 14 }}>Loading...</div>
        ) : projects.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-mut)', fontSize: 14, lineHeight: 1.5 }}>
            No active projects
            <div style={{ fontSize: 12.5, marginTop: 6 }}>Spawn agents from the desktop to see them here.</div>
          </div>
        ) : (
          projects.map((p, i) => (
            <div className="rise" key={p.path} style={{ animationDelay: `${Math.min(i * 30, 240)}ms` }}>
              <Row
                avatar={<Avatar name={p.name} active={p.runningCount > 0} />}
                title={p.name}
                subtitle={`${p.agents.length} agent${p.agents.length === 1 ? '' : 's'}${p.runningCount > 0 ? `, ${p.runningCount} running` : ''}`}
                timestamp={p.lastActivity ? formatRelative(p.lastActivity) : undefined}
                badge={p.runningCount}
                onClick={() => push({ id: 'agents', projectPath: p.path, projectName: p.name })}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
