import type { ThreadSummary } from '../../types'
import { useLongPress } from '../../hooks/useLongPress'
import { ModelStack } from './ModelStack'

interface ChatRowProps {
  thread: ThreadSummary
  current: boolean
  onOpen: (id: string) => void
  onActions: (thread: ThreadSummary) => void
}

export function ChatRow({ thread, current, onOpen, onActions }: ChatRowProps) {
  const press = useLongPress(() => onActions(thread))
  const waiting = thread.attention === 'approval' || thread.attention === 'question'
  const state = waiting ? 'attention' : thread.busy ? 'working' : ''
  const sub = waiting ? (thread.attention === 'approval' ? 'Needs approval' : 'Has a question') : thread.busy ? 'Working' : thread.projectName || 'No project'
  const drivers = thread.drivers && thread.drivers.length > 0 ? thread.drivers : thread.driver ? [thread.driver] : []
  return (
    <button className="dw-chat" aria-current={current} onClick={() => onOpen(thread.threadId)} {...press}>
      <ModelStack drivers={drivers} />
      <span className="dw-chat-text">
        <span className="dw-chat-title">{thread.title || 'Chat'}</span>
        <span className="dw-chat-sub" data-state={state || undefined}>
          {sub}
        </span>
      </span>
    </button>
  )
}
