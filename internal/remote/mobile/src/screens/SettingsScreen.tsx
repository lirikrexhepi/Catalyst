import React, { useEffect, useState } from 'react'
import { api, getBase, setToken, setBase } from '../api'
import { maskToken } from '../debug'
import { getToken } from '../api'
import Avatar from '../components/Avatar'

export default function SettingsScreen(_props: { bare?: boolean }) {
  const [server] = useState(getBase())
  const [agents, setAgents] = useState({ total: 0, running: 0 })

  useEffect(() => {
    let mounted = true
    api.agents().then(list => {
      if (mounted) setAgents({ total: list.length, running: list.filter(a => a.state === 'running').length })
    }).catch(() => undefined)
    return () => { mounted = false }
  }, [])

  const disconnect = () => {
    setToken('')
    setBase('')
    window.location.reload()
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0 20px' }}>
          <Avatar name="Orchestrator" size={88} active />
          <div style={{ fontSize: 21, fontWeight: 800, marginTop: 12, letterSpacing: '-0.01em' }}>Orchestrator</div>
          <div style={{ fontSize: 13.5, color: 'var(--text-mut)', marginTop: 3 }}>
            {agents.running > 0 ? `${agents.running} of ${agents.total} agents running` : `${agents.total} agents`}
          </div>
        </div>

        <div style={{ margin: '0 14px', borderRadius: 18, overflow: 'hidden', background: 'rgba(255,255,255,0.045)' }}>
          <SettingRow label="Server" value={server || 'This device'} />
          <Divider />
          <SettingRow label="Session" value={maskToken(getToken())} />
          <Divider />
          <SettingRow label="Connection" value="Tailscale Funnel" accent />
        </div>

        <div style={{ margin: '14px 14px 0', borderRadius: 18, overflow: 'hidden', background: 'rgba(255,255,255,0.045)' }}>
          <button
            onClick={disconnect}
            style={{ width: '100%', padding: '14px 16px', fontSize: 16, fontWeight: 600, color: 'var(--red)', textAlign: 'center' }}
          >
            Disconnect
          </button>
        </div>

        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-mut)', marginTop: 18 }}>
          Orchestrator Mobile · v1
        </div>
      </div>
    </div>
  )
}

function SettingRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 12 }}>
      <div style={{ fontSize: 15.5, color: 'var(--text-pri)', flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, fontSize: 14, color: accent ? 'var(--green)' : 'var(--text-mut)', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </div>
    </div>
  )
}

function Divider() {
  return <div style={{ height: 0.5, background: 'var(--border-div)', marginLeft: 16 }} />
}
