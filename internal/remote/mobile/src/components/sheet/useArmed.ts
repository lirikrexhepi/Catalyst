import { useCallback, useEffect, useRef, useState } from 'react'
import { SHEET } from './layout'

export function useArmed(): [boolean, () => boolean] {
  const [armed, setArmed] = useState(false)
  const timer = useRef(0)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const confirm = useCallback(() => {
    window.clearTimeout(timer.current)
    if (armed) {
      setArmed(false)
      return true
    }
    setArmed(true)
    timer.current = window.setTimeout(() => setArmed(false), SHEET.armTimeout)
    return false
  }, [armed])

  return [armed, confirm]
}
