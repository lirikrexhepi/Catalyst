import { useEffect, useState } from 'react'
import { Bell, BellRing, CircleCheck, Eye, Moon, Power, RefreshCw, Send, Unplug } from 'lucide-react'
import { showAllChats, useHiddenChats } from '../hiddenChats'
import { Sheet, SheetList, SheetNote, SheetRow, useArmed } from '../components/sheet'
import { GlassSwitch } from '../ui'
import { api, getBase, setBase, setToken } from '../api'
import { loadProviders, refreshSummaries, useStore } from '../store'
import type { PushPrefs } from '../api'
import { currentSubscription, disablePush, enablePush, loadPrefs, pushSupport, sendTest, updatePrefs } from '../push'

const BLOCKED = 'Allow notifications in iOS Settings first'

export default function SettingsSheet({ onClose }: { onClose: () => void }) {
  const connection = useStore((s) => s.connection)
  const hidden = useHiddenChats()
  const base = (getBase() || window.location.origin).replace(/^https?:\/\//, '')
  const [canPowerOff, setCanPowerOff] = useState(false)
  const [power, setPower] = useState<'idle' | 'sending' | 'done' | string>('idle')
  const [shutdownArmed, confirmShutdown] = useArmed()
  const [disconnectArmed, confirmDisconnect] = useArmed()

  useEffect(() => {
    api
      .status()
      .then((s) => setCanPowerOff(Boolean(s.canPowerOff)))
      .catch(() => setCanPowerOff(false))
  }, [])

  const shutdown = () => {
    if (!confirmShutdown()) return
    setPower('sending')
    api
      .shutdownPC()
      .then(() => setPower('done'))
      .catch((e: unknown) => setPower(e instanceof Error ? e.message : 'Shutdown failed'))
  }

  const disconnect = () => {
    if (!confirmDisconnect()) return
    setToken('')
    setBase('')
    window.location.hash = ''
    window.location.reload()
  }

  const powerLabel = power === 'sending' ? 'Shutting down' : power === 'done' ? 'PC is off' : shutdownArmed ? 'Confirm shutdown' : 'Shut down PC'
  const powerError = power !== 'idle' && power !== 'sending' && power !== 'done' ? power : null
  const status = connection === 'live' ? 'Connected' : connection === 'connecting' ? 'Connecting' : 'Offline'

  return (
    <Sheet title="Settings" onClose={onClose}>
      {(dismiss) => (
        <>
          <NotificationSettings />
          <SheetList>
            <SheetRow
              icon={Eye}
              label="Hidden chats"
              detail={hidden.size ? `Show ${hidden.size}` : 'None'}
              disabled={hidden.size === 0}
              onClick={showAllChats}
            />
            <SheetRow
              icon={RefreshCw}
              label="Refresh"
              onClick={() =>
                dismiss(() => {
                  void refreshSummaries()
                  void loadProviders(true)
                })
              }
            />
          </SheetList>
          <SheetList>
            {canPowerOff ? (
              <SheetRow icon={Power} label={powerLabel} tone="danger" disabled={power === 'sending' || power === 'done'} onClick={shutdown} />
            ) : null}
            <SheetRow icon={Unplug} label={disconnectArmed ? 'Confirm disconnect' : 'Disconnect'} tone="danger" onClick={disconnect} />
          </SheetList>
          <SheetNote tone={powerError ? 'error' : undefined}>{powerError ?? `${status} · ${base}`}</SheetNote>
        </>
      )}
    </Sheet>
  )
}

function NotificationSettings() {
  const support = pushSupport()
  const [enabled, setEnabled] = useState(false)
  const [prefs, setPrefs] = useState<PushPrefs>(loadPrefs)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; tone?: 'error' } | null>(null)
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
      if (text === 'denied') setNote({ text: BLOCKED, tone: 'error' })
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
      setNote({ text: 'Test sent' })
    })

  if (support !== 'supported') {
    return (
      <SheetList>
        <SheetRow icon={Bell} label="Notifications" detail={support === 'needs-install' ? 'Add to Home Screen' : 'Unavailable'} />
      </SheetList>
    )
  }

  const toggle = (label: string, checked: boolean, onChange: (v: boolean) => void, disabled = busy) => (
    <GlassSwitch label={label} checked={checked} disabled={disabled} onChange={onChange} />
  )

  return (
    <>
      <SheetList>
        <SheetRow icon={Bell} label="Notifications" trailing={toggle('Notifications', enabled, (v) => void toggleAll(v), busy || blocked)} />
        {enabled ? (
          <>
            <SheetRow icon={BellRing} label="Needs you" trailing={toggle('Needs you', prefs.attention, (v) => change({ attention: v }))} />
            <SheetRow icon={CircleCheck} label="Finished" trailing={toggle('Finished', prefs.finished, (v) => change({ finished: v }))} />
            <SheetRow icon={Moon} label="Only when away" trailing={toggle('Only when away', prefs.away, (v) => change({ away: v }))} />
            <SheetRow icon={Send} label="Send test" disabled={busy} onClick={() => void test()} />
          </>
        ) : null}
      </SheetList>
      {note || blocked ? <SheetNote tone={note ? note.tone : 'error'}>{note?.text ?? BLOCKED}</SheetNote> : null}
    </>
  )
}
