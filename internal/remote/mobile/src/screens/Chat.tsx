import { Conversation } from './chat/Conversation'
import { NewChat } from './chat/NewChat'

interface ChatProps {
  threadId: string | null
  openDrawer: () => void
  go: (id: string | null) => void
}

export default function Chat({ threadId, openDrawer, go }: ChatProps) {
  return threadId ? <Conversation threadId={threadId} openDrawer={openDrawer} go={go} /> : <NewChat openDrawer={openDrawer} go={go} />
}
