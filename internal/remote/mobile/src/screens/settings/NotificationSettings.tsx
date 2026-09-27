import { useEffect, useState } from 'react'
import { Bell, BellRing, CircleCheck, Moon, Send } from 'lucide-react'
import { SheetList, SheetNote, SheetRow } from '../../components/sheet'
import { GlassSwitch } from '../../ui'
import type { PushPrefs } from '../../api'
import { currentSubscription, disablePush, enablePush, loadPrefs, pushSupport, sendTest, updatePrefs } from '../../push'

const BLOCKED = 'Allow notifications in iOS Settings first'

export function NotificationSettings({ compact }: { compact?: boolean }) {
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
        {enabled && !compact ? (
          <>
            <SheetRow icon={BellRing} label="Needs you" trailing={toggle('Needs you', prefs.attention, (v) => change({ attention: v }))} />
            <SheetRow icon={CircleCheck} label="Finished" trailing={toggle('Finished', prefs.finished, (v) => change({ finished: v }))} />
            <SheetRow icon={Moon} label="Only when away" trailing={toggle('Only when away', prefs.away, (v) => change({ away: v }))} />
            <SheetRow
              icon={Send}
              label="Send test"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await sendTest()
                  setNote({ text: 'Test sent' })
                })
              }
            />
          </>
        ) : null}
      </SheetList>
      {note || blocked ? <SheetNote tone={note ? note.tone : 'error'}>{note?.text ?? BLOCKED}</SheetNote> : null}
    </>
  )
}
