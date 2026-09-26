import { Power, RotateCcw, Square } from 'lucide-react'
import Sheet from '../../components/Sheet'

interface ChatActionsProps {
  title: string
  busy: boolean
  coordinator: boolean
  live: boolean
  onStop: () => void
  onStartOver: () => void
  onEndAgent: () => void
  onClose: () => void
}

export function ChatActions({ title, busy, coordinator, live, onStop, onStartOver, onEndAgent, onClose }: ChatActionsProps) {
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="list">
        <button disabled={!busy} onClick={onStop}>
          <Square size={18} aria-hidden /> Stop responding
        </button>
        {coordinator ? (
          <button onClick={onStartOver}>
            <RotateCcw size={18} aria-hidden /> Start over
          </button>
        ) : (
          <button style={{ color: 'var(--fault)' }} disabled={!live} onClick={onEndAgent}>
            <Power size={18} aria-hidden /> End agent
          </button>
        )}
      </div>
    </Sheet>
  )
}
