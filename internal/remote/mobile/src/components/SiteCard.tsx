import React from 'react'
import { ChevronRight, Globe } from 'lucide-react'
import type { DevServer } from '../types'

/** One dev server on the PC in the preview picker. */
export default function SiteCard({ server, onOpen }: { server: DevServer; onOpen: (server: DevServer) => void }) {
  const live = server.preview?.state === 'live'
  return (
    <button onClick={() => onOpen(server)}>
      <Globe size={18} aria-hidden="true" style={{ color: live ? 'var(--ok)' : 'var(--text-2)' }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        {server.name || 'Dev server'}
        <span className="sub" style={{ display: 'block' }}>
          localhost:{server.port}
          {live ? ' · shared' : ''}
        </span>
      </span>
      <ChevronRight size={16} aria-hidden="true" style={{ color: 'var(--text-3)' }} />
    </button>
  )
}
