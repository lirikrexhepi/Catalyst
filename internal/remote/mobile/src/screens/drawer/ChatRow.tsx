import type { ThreadSummary } from '../../types'
import { ModelStack } from './ModelStack'

interface ChatRowProps {
  thread: ThreadSummary
  current: boolean
  onOpen: (id: string) => void
}

export function ChatRow({ thread, current, onOpen }: ChatRowProps) {
  const waiting = thread.attention === 'approval' || thread.attention === 'question'
  const sub = waiting ? (thread.attention === 'approval' ? 'Needs your approval' : 'Asked you a question') : thread.projectName || 'No project'
  const drivers = thread.drivers && thread.drivers.length > 0 ? thread.drivers : thread.driver ? [thread.driver] : []
  return (
    <button className="dw-chat" aria-current={current} onClick={() => onOpen(thread.threadId)}>
      <ModelStack drivers={drivers} />
      <span className="dw-chat-text">
        <span className="dw-chat-title">{thread.title || 'Chat'}</span>
        <span className={waiting ? 'dw-chat-sub attention' : 'dw-chat-sub'}>{sub}</span>
      </span>
      {waiting || thread.busy ? <span className={waiting ? 'dot' : 'dot pulse'} aria-label={waiting ? 'Needs you' : 'Working'} /> : null}
    </button>
  )
}
