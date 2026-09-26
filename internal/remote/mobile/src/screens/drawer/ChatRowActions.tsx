import { useState } from 'react'
import { EyeOff, Trash2 } from 'lucide-react'
import { Sheet, SheetNote, SheetTile, SheetTiles, useArmed, type Dismiss } from '../../components/sheet'
import { api } from '../../api'
import { hideChat } from '../../hiddenChats'
import { message, refreshSummaries } from '../../store'
import type { ThreadSummary } from '../../types'

interface ChatRowActionsProps {
  thread: ThreadSummary
  current: boolean
  onLeave: () => void
  onClose: () => void
}

export function ChatRowActions({ thread, current, onLeave, onClose }: ChatRowActionsProps) {
  const [armed, confirm] = useArmed()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const remove = async (dismiss: Dismiss) => {
    if (busy || !confirm()) return
    setBusy(true)
    setError(null)
    try {
      if (thread.live) await api.endAgent(thread.threadId).catch(() => undefined)
      await api.deleteThread(thread.threadId)
      await refreshSummaries()
      dismiss(() => {
        if (current) onLeave()
      })
    } catch (e) {
      setError(message(e))
      setBusy(false)
    }
  }

  return (
    <Sheet title={thread.title || 'Chat'} onClose={onClose}>
      {(dismiss) => (
        <>
          <SheetTiles>
            <SheetTile icon={EyeOff} label="Hide" disabled={busy} onClick={() => dismiss(() => hideChat(thread.threadId))} />
            <SheetTile
              icon={Trash2}
              label={busy ? 'Deleting' : armed ? 'Confirm' : 'Delete'}
              tone="danger"
              armed={armed || busy}
              onClick={() => void remove(dismiss)}
            />
          </SheetTiles>
          {error ? <SheetNote tone="error">{error}</SheetNote> : null}
        </>
      )}
    </Sheet>
  )
}
