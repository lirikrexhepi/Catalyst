import { Project, RemoteAgentView, TaskState } from './types'

export function getProjectName(cwd: string): string {
  return cwd.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? cwd
}

export function groupAgentsByProject(agents: RemoteAgentView[]): Project[] {
  // TODO: Consider adding a server-side /api/projects endpoint in the future for richer project metadata (see implementation_plan.md)
  const map = new Map<string, Project>()
  
  agents.forEach((agent, i) => {
    const path = agent.cwd || ''
    if (!map.has(path)) {
      map.set(path, {
        path,
        name: getProjectName(path),
        agents: [],
        runningCount: 0,
        lastActivity: Date.now() - i // fallback fake activity sort
      })
    }
    const p = map.get(path)!
    p.agents.push(agent)
    if (agent.state === 'running') {
      p.runningCount++
    }
  })

  return Array.from(map.values()).sort((a, b) => {
    if (a.runningCount !== b.runningCount) {
      return b.runningCount - a.runningCount
    }
    return a.name.localeCompare(b.name)
  })
}

export function formatTime(ms: number): string {
  const d = new Date(ms)
  const now = new Date()
  const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  
  const diffDays = Math.floor((now.getTime() - ms) / (1000 * 60 * 60 * 24))
  if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: 'short' })
  }
  
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
}

export function formatRelative(ms: number): string {
  const diff = Math.floor((Date.now() - ms) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff/60)}m`
  if (diff < 86400) return `${Math.floor(diff/3600)}h`
  return `${Math.floor(diff/86400)}d`
}

export function stateColor(state: TaskState): string {
  switch (state) {
    case 'running': return '#38bdf8'
    case 'complete': return 'rgba(255,255,255,0.50)'
    case 'failed': return '#f87171'
    case 'pending': return 'rgba(255,255,255,0.30)'
    case 'closed': return 'rgba(255,255,255,0.25)'
    default: return 'rgba(255,255,255,0.30)'
  }
}
