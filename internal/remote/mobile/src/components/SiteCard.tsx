import React, { useState } from 'react'
import { ExternalLink, Globe, Loader2 } from 'lucide-react'
import type { DevServer } from '../types'

interface Props {
  server: DevServer
  ownerTitle?: string
  busy: boolean
  onStart: (port: number) => Promise<unknown>
  onStop: (port: number) => Promise<unknown>
}

/** One dev server on the PC and the public link that carries it to the phone. */
export default function SiteCard({ server, ownerTitle, busy, onStart, onStop }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const preview = server.preview

  const share = async () => {
    setError(null)
    try {
      await onStart(server.port)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const unshare = async () => {
    setError(null)
    try {
      await onStop(server.port)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } catch { /* ignore */ }
      ta.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="site">
      <div className="site-top">
        <Globe size={18} aria-hidden="true" style={{ color: 'var(--ok)' }} />
        <span className="site-name">{server.name || 'Dev server'}</span>
        <span className="site-port">:{server.port}</span>
      </div>
      {ownerTitle && <div className="site-owner">{ownerTitle}</div>}

      {preview?.state === 'live' && preview.url ? (
        <>
          <button className="site-link" onClick={() => void copy(preview.url!)} title="Tap to copy">
            {preview.url}
          </button>
          <div className="site-actions">
            <button className="btn primary grow" onClick={() => window.open(preview.url, '_blank', 'noopener,noreferrer')}>
              <ExternalLink size={16} aria-hidden="true" /> {copied ? 'Copied — tap Open' : 'Open site'}
            </button>
            <button className="btn" disabled={busy} onClick={() => void unshare()}>
              Stop
            </button>
          </div>
          <div className="site-note">Tap the link to copy it. Works on cell data, no login needed.</div>
        </>
      ) : preview?.state === 'starting' ? (
        <div className="site-note">
          <Loader2 size={14} className="spin" aria-hidden="true" style={{ verticalAlign: '-2px' }} /> Creating
          public link, it appears here in a few seconds…
        </div>
      ) : (
        <>
          <div className="site-actions">
            <button className="btn grow" disabled={busy} onClick={() => void share()}>
              {busy ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Globe size={16} aria-hidden="true" />}
              Share to phone
            </button>
          </div>
          {(error || preview?.error) && <div className="site-err">{error || preview?.error}</div>}
        </>
      )}
    </div>
  )
}
