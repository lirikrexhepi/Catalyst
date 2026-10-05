import { useCallback, useEffect, useState } from 'react'
import { Monitor, MonitorOff, Sunrise } from '../../icons'
import { SheetList, SheetNote, SheetRow } from '../../components/sheet'
import { GlassSwitch } from '../../ui'
import { api } from '../../api'
import { failure } from '../../store'
import type { MonitorStatus } from '../../types'

export function MonitorsSection() {
  const [status, setStatus] = useState<MonitorStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api
      .monitors()
      .then((s) => {
        setStatus(s)
        setError(null)
      })
      .catch((e) => setError(failure(e)))
  }, [])

  useEffect(() => {
    load()
    const id = window.setInterval(load, 10000)
    return () => window.clearInterval(id)
  }, [load])

  const act = (fn: () => Promise<MonitorStatus>) => {
    setBusy(true)
    setError(null)
    fn()
      .then(setStatus)
      .catch((e) => setError(failure(e)))
      .finally(() => setBusy(false))
  }

  if (status && !status.supported) {
    return (
      <SheetList>
        <SheetRow icon={Monitor} label="Monitors" detail="Windows only" />
      </SheetList>
    )
  }

  const count = status?.count ?? 0
  const state = !status ? '' : status.off ? 'Off' : 'On'

  return (
    <>
      <SheetList>
        <SheetRow icon={Monitor} label={!status ? 'Monitors' : count === 1 ? '1 monitor' : `${count} monitors`} detail={state} />
        <SheetRow icon={MonitorOff} label="Turn off now" disabled={busy || !status} onClick={() => act(api.monitorsOff)} />
        <SheetRow
          icon={Sunrise}
          label="Off after remote wake"
          trailing={
            <GlassSwitch
              label="Turn monitors off after a remote wake"
              checked={Boolean(status?.autoOff)}
              disabled={busy || !status}
              onChange={(v) => act(() => api.monitorsAutoOff(v))}
            />
          }
        />
      </SheetList>
      {error ? <SheetNote tone="error">{error}</SheetNote> : null}
    </>
  )
}
