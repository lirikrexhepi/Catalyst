import React from 'react'
import { RefreshCw, Unplug } from 'lucide-react'
import Sheet from '../components/Sheet'
import { getBase, setBase, setToken } from '../api'
import { loadProviders, refreshSummaries, useStore } from '../store'

export default function SettingsSheet({ onClose }: { onClose: () => void }) {
  const connection = useStore((s) => s.connection)
  const base = getBase() || window.location.origin

  const disconnect = () => {
    setToken('')
    setBase('')
    window.location.hash = ''
    window.location.reload()
  }

  return (
    <Sheet title="Connection" onClose={onClose}>
      <div>
        <span className="label">Your PC</span>
        <div style={{ overflowWrap: 'anywhere', fontSize: 15 }}>{base}</div>
        <div className="when" style={{ marginTop: 4 }}>
          {connection === 'live' ? 'Connected' : connection === 'connecting' ? 'Connecting' : 'Offline, retrying'}
        </div>
      </div>
      <div className="list">
        <button
          onClick={() => {
            void refreshSummaries()
            void loadProviders(true)
            onClose()
          }}
        >
          <RefreshCw size={18} aria-hidden="true" /> Refresh agents and models
        </button>
        <button onClick={disconnect} style={{ color: 'var(--fault)' }}>
          <Unplug size={18} aria-hidden="true" /> Disconnect this phone
        </button>
      </div>
    </Sheet>
  )
}
