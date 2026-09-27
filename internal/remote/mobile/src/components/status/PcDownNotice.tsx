import { useEffect, useState } from 'react'
import { Loader2, WifiOff } from 'lucide-react'
import { retryNow, useStore } from '../../store'
import { StatusPill } from './StatusPill'

const SHOW_AFTER_MS = 1500
const RETRY_SPIN_MS = 1800

export function PcDownNotice({ placement = 'top' }: { placement?: 'top' | 'dock' }) {
  const pcDown = useStore((st) => st.pcDown)
  const [shown, setShown] = useState(false)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    if (!pcDown) {
      setShown(false)
      return
    }
    const timer = window.setTimeout(() => setShown(true), SHOW_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [pcDown])

  useEffect(() => {
    if (!retrying) return
    const timer = window.setTimeout(() => setRetrying(false), RETRY_SPIN_MS)
    return () => window.clearTimeout(timer)
  }, [retrying])

  if (!shown) return null

  const retry = () => {
    setRetrying(true)
    retryNow()
  }

  return (
    <StatusPill placement={placement} icon={retrying ? Loader2 : WifiOff} action={{ label: 'Retry', onClick: retry, busy: retrying }}>
      {retrying ? 'Reconnecting' : "Can't reach your PC"}
    </StatusPill>
  )
}
