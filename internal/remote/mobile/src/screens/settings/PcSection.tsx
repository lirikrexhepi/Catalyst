import { useEffect, useState } from 'react'
import { Coffee, Power, Unplug } from 'lucide-react'
import { SheetList, SheetNote, SheetRow, useArmed } from '../../components/sheet'
import { api, getBase, setBase, setToken } from '../../api'
import { useStore } from '../../store'
import { GlassSwitch } from '../../ui'
import { setKeepAwake, useKeepAwake } from '../../keepAwake'
import { clearRoute } from '../../platform/route'

export function PcSection() {
  const connection = useStore((s) => s.connection)
  const base = (getBase() || window.location.origin).replace(/^https?:\/\//, '')
  const [canPowerOff, setCanPowerOff] = useState(false)
  const [power, setPower] = useState<'idle' | 'sending' | 'done' | string>('idle')
  const [shutdownArmed, confirmShutdown] = useArmed()
  const [disconnectArmed, confirmDisconnect] = useArmed()
  const keepAwake = useKeepAwake()

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
    clearRoute()
    window.location.reload()
  }

  const powerLabel = power === 'sending' ? 'Shutting down' : power === 'done' ? 'PC is off' : shutdownArmed ? 'Confirm shutdown' : 'Shut down PC'
  const powerError = power !== 'idle' && power !== 'sending' && power !== 'done' ? power : null
  const status = connection === 'live' ? 'Connected' : connection === 'connecting' ? 'Connecting' : 'Offline'

  return (
    <>
      <SheetList>
        <SheetRow
          icon={Coffee}
          label="Keep awake while open"
          trailing={<GlassSwitch label="Keep the PC awake while this app is open" checked={keepAwake} onChange={setKeepAwake} />}
        />
      </SheetList>
      <SheetList>
        {canPowerOff ? (
          <SheetRow icon={Power} label={powerLabel} tone="danger" disabled={power === 'sending' || power === 'done'} onClick={shutdown} />
        ) : null}
        <SheetRow icon={Unplug} label={disconnectArmed ? 'Confirm disconnect' : 'Disconnect this phone'} tone="danger" onClick={disconnect} />
      </SheetList>
      <SheetNote tone={powerError ? 'error' : undefined}>{powerError ?? `${status} · ${base}`}</SheetNote>
    </>
  )
}
