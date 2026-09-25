import React, { useEffect, useState } from 'react'
import { Power, RefreshCw, Unplug } from 'lucide-react'
import Sheet from '../components/Sheet'
import { api, getBase, setBase, setToken } from '../api'
import { loadProviders, refreshSummaries, useStore } from '../store'

export default function SettingsSheet({ onClose }: { onClose: () => void }) {
  const connection = useStore((s) => s.connection)
  const base = getBase() || window.location.origin
  // Only offered when the PC runs headless: with the window open someone is there.
  const [canPowerOff, setCanPowerOff] = useState(false)
  const [power, setPower] = useState<'idle' | 'sending' | 'done' | string>('idle')

  useEffect(() => {
    api
      .status()
      .then((s) => setCanPowerOff(Boolean(s.canPowerOff)))
      .catch(() => setCanPowerOff(false))
  }, [])

  const shutdown = () => {
    if (!window.confirm('Shut down the PC? Running agents are stopped and their chats can be resumed later.')) return
    setPower('sending')
    api
      .shutdownPC()
      .then(() => setPower('done'))
      .catch((e: unknown) => setPower(e instanceof Error ? e.message : 'Shutdown failed'))
  }

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
        {canPowerOff && (
          <button onClick={shutdown} disabled={power === 'sending' || power === 'done'} style={{ color: 'var(--fault)' }}>
            <Power size={18} aria-hidden="true" />{' '}
            {power === 'sending' ? 'Shutting down…' : power === 'done' ? 'PC is shutting down' : 'Shut down PC'}
          </button>
        )}
        {power !== 'idle' && power !== 'sending' && power !== 'done' && (
          <div className="when" style={{ color: 'var(--fault)' }}>{power}</div>
        )}
        <button onClick={disconnect} style={{ color: 'var(--fault)' }}>
          <Unplug size={18} aria-hidden="true" /> Disconnect this phone
        </button>
      </div>
    </Sheet>
  )
}
