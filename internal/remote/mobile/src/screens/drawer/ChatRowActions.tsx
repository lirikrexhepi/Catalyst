import { useState } from 'react'
import { EyeOff, Trash2 } from 'lucide-react'
import { Sheet, SheetNote, type Dismiss } from '../../components/sheet'
import { ICON_STROKE } from '../../components/chrome/BarButton'
import { MorphButtons } from '../../ui/glass/MorphButtons'
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const remove = async (dismiss: Dismiss) => {
    if (busy) return
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
          <MorphButtons
            className="sheet-morph"
            size={52}
            spacing={16}
            items={[
              { id: 'hide', label: 'Hide chat', icon: <EyeOff size={24} strokeWidth={ICON_STROKE} />, disabled: busy, onClick: () => dismiss(() => hideChat(thread.threadId)) },
              {
                id: 'delete',
                label: 'Delete chat',
                icon: <Trash2 size={24} strokeWidth={ICON_STROKE} />,
                tone: 'danger',
                disabled: busy,
                actions: [
                  { id: 'delete', label: 'Delete', tone: 'danger', onSelect: () => void remove(dismiss) },
                  { id: 'cancel', label: 'Cancel', dismiss: true },
                ],
              },
            ]}
          />
          {busy ? <SheetNote>Deleting</SheetNote> : null}
          {error ? <SheetNote tone="error">{error}</SheetNote> : null}
        </>
      )}
    </Sheet>
  )
}
