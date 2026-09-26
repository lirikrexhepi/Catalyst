import { Power, RotateCcw, Square } from 'lucide-react'
import { Sheet, SheetTile, SheetTiles } from '../../components/sheet'

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
      {(dismiss) => (
        <SheetTiles>
          <SheetTile icon={Square} label="Stop" disabled={!busy} onClick={() => dismiss(onStop)} />
          {coordinator ? (
            <SheetTile icon={RotateCcw} label="Start over" onClick={() => dismiss(onStartOver)} />
          ) : (
            <SheetTile icon={Power} label="End agent" tone="danger" disabled={!live} onClick={() => dismiss(onEndAgent)} />
          )}
        </SheetTiles>
      )}
    </Sheet>
  )
}
