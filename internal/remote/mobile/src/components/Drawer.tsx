import React, { useState } from 'react'
import { Project, RemoteAgentView } from '../types'
import Avatar from './Avatar'

export type Selection =
  | { kind: 'coordinator' }
  | { kind: 'project'; path: string; name: string }
  | { kind: 'agent'; threadId: string; title: string }
  | { kind: 'settings' }

interface DrawerProps {
  open: boolean
  onClose: () => void
  projects: Project[]
  selection: Selection
  onSelect: (s: Selection) => void
  onNewChat: () => void
}

export default function Drawer({ open, onClose, projects, selection, onSelect, onNewChat }: DrawerProps) {
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const filteredProjects = q
    ? projects.filter(p => p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q))
    : projects

  const recentAgents: RemoteAgentView[] = []
  for (const p of projects) {
    for (const a of p.agents) {
      if (!q || a.title.toLowerCase().includes(q)) recentAgents.push(a)
    }
  }
  recentAgents.sort((a, b) => {
    const ar = a.live && a.state === 'running' ? 0 : 1
    const br = b.live && b.state === 'running' ? 0 : 1
    return ar - br
  })

  const pick = (s: Selection) => {
    onSelect(s)
    onClose()
  }

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50, pointerEvents: open ? 'auto' : 'none' }}>
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          opacity: open ? 1 : 0,
          transition: 'opacity 220ms',
        }}
      />
      <div
        className="safe-top"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: 'min(84vw, 330px)',
          maxWidth: '100%',
          background: 'rgba(14,14,17,0.92)',
          WebkitBackdropFilter: 'blur(30px) saturate(180%)',
          backdropFilter: 'blur(30px) saturate(180%)',
          borderRight: '0.5px solid var(--border-div)',
          transform: open ? 'translateX(0)' : 'translateX(-102%)',
          transition: 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '10px 14px 6px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Orchestrator
          </div>
          <button
            onClick={() => { onNewChat(); onClose() }}
            aria-label="New chat"
            style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        <div style={{ padding: '2px 14px 8px' }}>
          <div className="glass" style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 16, padding: '9px 12px' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-mut)" strokeWidth="2.2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search"
              style={{ flex: 1, minWidth: 0, fontSize: 15, color: '#fff', background: 'transparent' }}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: 16 }}>
          <DrawerItem
            label="Coordinator"
            sub="New task"
            avatar={<Avatar name="Coordinator" size={44} />}
            selected={selection.kind === 'coordinator'}
            onClick={() => pick({ kind: 'coordinator' })}
          />

          <DrawerLabel text={`Projects · ${filteredProjects.length}`} />
          {filteredProjects.length === 0 && (
            <div style={{ padding: '6px 16px', fontSize: 13.5, color: 'var(--text-mut)' }}>
              {projects.length === 0 ? 'Add a project on the desktop.' : 'No matches.'}
            </div>
          )}
          {filteredProjects.map(p => (
            <DrawerItem
              key={p.id || p.path}
              label={p.name}
              sub={p.totalAgents === 0 ? 'No agents' : `${p.totalAgents} agent${p.totalAgents === 1 ? '' : 's'}${p.runningCount > 0 ? ` · ${p.runningCount} running` : ''}`}
              avatar={<Avatar name={p.name} size={44} active={p.runningCount > 0} />}
              selected={selection.kind === 'project' && selection.path === p.path}
              badge={p.runningCount}
              onClick={() => pick({ kind: 'project', path: p.path, name: p.name })}
            />
          ))}

          <DrawerLabel text="Recent agents" />
          {recentAgents.slice(0, 8).map(a => (
            <DrawerItem
              key={a.threadId}
              label={a.title}
              sub={`${a.model}${a.live && a.state === 'running' ? ' · running' : ''}`}
              avatar={<Avatar name={a.title} size={44} active={a.live && a.state === 'running'} />}
              selected={selection.kind === 'agent' && selection.threadId === a.threadId}
              onClick={() => pick({ kind: 'agent', threadId: a.threadId, title: a.title })}
            />
          ))}
          {recentAgents.length === 0 && (
            <div style={{ padding: '6px 16px', fontSize: 13.5, color: 'var(--text-mut)' }}>Nothing yet.</div>
          )}
        </div>

        <div style={{ borderTop: '0.5px solid var(--border-div)', padding: '6px 8px calc(10px + env(safe-area-inset-bottom, 0px))' }}>
          <DrawerItem
            label="Settings"
            avatar={
              <span style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-sec)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </span>
            }
            selected={selection.kind === 'settings'}
            onClick={() => pick({ kind: 'settings' })}
          />
        </div>
      </div>
    </div>
  )
}

function DrawerLabel({ text }: { text: string }) {
  return (
    <div style={{ padding: '14px 16px 4px', fontSize: 12.5, fontWeight: 700, color: 'var(--text-mut)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {text}
    </div>
  )
}

function DrawerItem({ label, sub, avatar, selected, badge, onClick }: {
  label: string
  sub?: string
  avatar: React.ReactNode
  selected?: boolean
  badge?: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '8px 14px',
        background: selected ? 'rgba(10,132,255,0.14)' : 'transparent',
        borderRadius: 14,
        textAlign: 'left',
        maxWidth: '100%',
      }}
    >
      {avatar}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.01em' }}>
          {label}
        </span>
        {!!sub && (
          <span style={{ display: 'block', fontSize: 13, color: 'var(--text-mut)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>
            {sub}
          </span>
        )}
      </span>
      {!!badge && badge > 0 && (
        <span style={{ background: 'var(--accent)', color: '#fff', fontSize: 12.5, fontWeight: 700, height: 21, minWidth: 21, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px', flexShrink: 0 }}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}
