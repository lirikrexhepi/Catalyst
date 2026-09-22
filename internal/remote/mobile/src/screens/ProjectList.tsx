import React, { useEffect, useState } from 'react'
import { Screen, Project, RuntimeEvent } from '../types'
import { api } from '../api'
import { groupAgentsByProject, formatRelative } from '../utils'
import NavHeader from '../components/NavHeader'
import Row from '../components/Row'
import Avatar from '../components/Avatar'
import { setToken } from '../api'

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
          api.history().catch(() => []) // ok if fails
        ])
        if (mounted) {
          setProjects(groupAgentsByProject(agents))
          if (history && history.length > 0) {
            setCoordinatorEvent(history[history.length - 1])
          }
          setLoading(false)
        }
      } catch (e) {
        console.error(e)
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
      <NavHeader
        title="Orchestrator"
        large
        rightAction={
          <button
            onClick={() => { setToken(''); window.location.reload() }}
            style={{ fontSize: 12, color: 'var(--text-mut)', cursor: 'pointer' }}
          >
            Disconnect
          </button>
        }
      />
      
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <Row 
          avatar={<Avatar name="C" active />}
          title="Coordinator"
          subtitle={coordinatorEvent?.text || "Global orchestrator"}
          timestamp={coordinatorEvent ? formatRelative(coordinatorEvent.at) : undefined}
          onClick={() => push({ id: 'coordinator' })}
        />

        {loading && projects.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-mut)' }}>Loading...</div>
        ) : projects.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-mut)', fontSize: 14 }}>
            No active projects
          </div>
        ) : (
          projects.map(p => (
            <Row
              key={p.path}
              avatar={<Avatar name={p.name} active={p.runningCount > 0} />}
              title={p.name}
              subtitle={`${p.agents.length} agent${p.agents.length === 1 ? '' : 's'}, ${p.runningCount} running`}
              badge={p.runningCount}
              timestamp={formatRelative(p.lastActivity)}
              onClick={() => push({ id: 'agents', projectPath: p.path, projectName: p.name })}
            />
          ))
        )}
      </div>
    </div>
  )
}
