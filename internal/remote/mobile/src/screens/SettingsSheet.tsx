import React, { useEffect, useState } from 'react'
import { Power, RefreshCw, Share, Unplug } from 'lucide-react'
import Sheet from '../components/Sheet'
import { api, getBase, setBase, setToken } from '../api'
import { loadProviders, refreshSummaries, useStore } from '../store'
import type { PushPrefs } from '../api'
import { currentSubscription, disablePush, enablePush, loadPrefs, pushSupport, sendTest, updatePrefs } from '../push'

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
    <Sheet title="Settings" onClose={onClose}>
      <NotificationSettings />
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

function Toggle({ label, detail, checked, disabled, onChange }: { label: string; detail?: string; checked: boolean; disabled?: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="toggle-row">
      <span className="txt">
        {label}
        {detail && <small>{detail}</small>}
      </span>
      <button className="switch" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} />
    </div>
  )
}

function NotificationSettings() {
  const support = pushSupport()
  const [enabled, setEnabled] = useState(false)
  const [prefs, setPrefs] = useState<PushPrefs>(loadPrefs)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null)
  const blocked = support === 'supported' && Notification.permission === 'denied'

  useEffect(() => {
    if (support !== 'supported') return
    void currentSubscription().then((sub) => setEnabled(Boolean(sub) && Notification.permission === 'granted'))
  }, [support])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setNote(null)
    try {
      await fn()
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e)
      if (text === 'denied') setNote({ text: 'Notifications are blocked. Allow them in iOS Settings › Notifications › Orchestrator.', tone: 'error' })
      else if (text !== 'dismissed') setNote({ text, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const toggleAll = (next: boolean) =>
    run(async () => {
      if (next) {
        await enablePush(prefs)
        setEnabled(true)
      } else {
        await disablePush()
        setEnabled(false)
      }
    })

  const change = (patch: Partial<PushPrefs>) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    void run(() => updatePrefs(next))
  }

  const test = () =>
    run(async () => {
      await sendTest()
      setNote({ text: 'Sent. It should arrive in a few seconds.', tone: 'ok' })
    })

  return (
    <div>
      <span className="label">Notifications</span>
      {support === 'needs-install' ? (
        <div className="group note-card">
          <Share size={20} aria-hidden="true" />
          <div>
            <strong>Add to Home Screen first</strong>
            <span>iPhone only sends notifications to apps on the Home Screen. Tap Share, then Add to Home Screen, and open Orchestrator from there.</span>
          </div>
        </div>
      ) : support === 'unsupported' ? (
        <div className="group note-card">
          <div>
            <strong>Not available here</strong>
            <span>This browser can't receive notifications. Open Orchestrator from its https address on your phone.</span>
          </div>
        </div>
      ) : (
        <>
          <div className="group">
            <Toggle label="Allow Notifications" checked={enabled} disabled={busy || blocked} onChange={(v) => void toggleAll(v)} />
            {enabled && (
              <>
                <Toggle label="Needs You" detail="Approvals and questions" checked={prefs.attention} disabled={busy} onChange={(v) => change({ attention: v })} />
                <Toggle label="Finished" detail="When an agent completes or stops" checked={prefs.finished} disabled={busy} onChange={(v) => change({ finished: v })} />
                <Toggle label="Only When Away" detail="Stay quiet while you're using the PC" checked={prefs.away} disabled={busy} onChange={(v) => change({ away: v })} />
                <button className="group-btn" onClick={() => void test()} disabled={busy}>
                  Send Test Notification
                </button>
              </>
            )}
          </div>
          <div className={`footnote${note?.tone === 'error' ? ' error' : ''}`}>
            {note?.text ??
              (blocked
                ? 'Notifications are blocked. Allow them in iOS Settings › Notifications › Orchestrator.'
                : 'Chats you have open on your phone stay quiet.')}
          </div>
        </>
      )}
    </div>
  )
}
