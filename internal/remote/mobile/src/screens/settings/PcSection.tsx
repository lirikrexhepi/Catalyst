import { useEffect, useState } from 'react'
import { Coffee, Power, Unplug } from 'lucide-react'
import { SheetList, SheetNote, SheetRow } from '../../components/sheet'
import { ICON_STROKE } from '../../components/chrome/BarButton'
import { MorphButtons } from '../../ui/glass/MorphButtons'
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
  const keepAwake = useKeepAwake()

  useEffect(() => {
    api
      .status()
      .then((s) => setCanPowerOff(Boolean(s.canPowerOff)))
      .catch(() => setCanPowerOff(false))
  }, [])

  const shutdown = () => {
    setPower('sending')
    api
      .shutdownPC()
      .then(() => setPower('done'))
      .catch((e: unknown) => setPower(e instanceof Error ? e.message : 'Shutdown failed'))
  }

  const disconnect = () => {
    setToken('')
    setBase('')
    clearRoute()
    window.location.reload()
  }

  const powerLabel = power === 'sending' ? 'Shutting down' : power === 'done' ? 'PC is off' : 'Shut down PC'
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
          <SheetRow
            icon={Power}
            label={powerLabel}
            tone="danger"
            trailing={
              <MorphButtons
                className="row-morph"
                size={36}
                anchor="end"
                inset={18}
                items={[
                  {
                    id: 'shutdown',
                    label: 'Shut down PC',
                    icon: <Power size={20} strokeWidth={ICON_STROKE} />,
                    tone: 'danger',
                    disabled: power === 'sending' || power === 'done',
                    actions: [
                      { id: 'shutdown', label: 'Shut down', tone: 'danger', onSelect: shutdown },
                      { id: 'cancel', label: 'Cancel', dismiss: true },
                    ],
                  },
                ]}
              />
            }
          />
        ) : null}
        <SheetRow
          icon={Unplug}
          label="Disconnect this phone"
          tone="danger"
          trailing={
            <MorphButtons
              className="row-morph"
              size={36}
              anchor="end"
              inset={18}
              items={[
                {
                  id: 'disconnect',
                  label: 'Disconnect this phone',
                  icon: <Unplug size={20} strokeWidth={ICON_STROKE} />,
                  tone: 'danger',
                  actions: [
                    { id: 'disconnect', label: 'Disconnect', tone: 'danger', onSelect: disconnect },
                    { id: 'cancel', label: 'Cancel', dismiss: true },
                  ],
                },
              ]}
            />
          }
        />
      </SheetList>
      <SheetNote tone={powerError ? 'error' : undefined}>{powerError ?? `${status} · ${base}`}</SheetNote>
    </>
  )
}
