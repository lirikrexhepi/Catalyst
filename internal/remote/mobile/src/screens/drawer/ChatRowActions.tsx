import { useState } from 'react'
import { EyeOff, Trash2 } from 'lucide-react'
import Sheet from '../../components/Sheet'
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
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hide = () => {
    hideChat(thread.threadId)
    onClose()
  }

  const remove = async () => {
    if (!confirming) {
      setConfirming(true)
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (thread.live) await api.endAgent(thread.threadId).catch(() => undefined)
      await api.deleteThread(thread.threadId)
      await refreshSummaries()
      if (current) onLeave()
      onClose()
    } catch (e) {
      setError(message(e))
      setBusy(false)
    }
  }

  return (
    <Sheet title={thread.title || 'Chat'} onClose={onClose}>
      <div className="list">
        <button onClick={hide} disabled={busy}>
          <EyeOff size={20} aria-hidden /> Hide from phone
        </button>
        <button onClick={() => void remove()} disabled={busy} style={{ color: 'var(--fault)' }}>
          <Trash2 size={20} aria-hidden />
          {busy ? 'Deleting…' : confirming ? 'Tap again to delete for good' : 'Delete chat'}
        </button>
      </div>
      <div className="when" style={{ padding: '0 4px' }}>
        {error ?? (confirming ? 'Deleting removes this chat from your PC as well.' : 'Hidden chats stay on your PC. Show them again from Settings.')}
      </div>
    </Sheet>
  )
}
