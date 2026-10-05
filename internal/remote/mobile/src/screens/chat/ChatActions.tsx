import { Power, RotateCcw, Square } from '../../icons'
import { Sheet } from '../../components/sheet'
import { ICON_STROKE } from '../../components/chrome/BarButton'
import { MorphButtons } from '../../ui/glass/MorphButtons'

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
        <MorphButtons
          className="sheet-morph"
          size={52}
          spacing={16}
          items={[
            { id: 'stop', label: 'Stop responding', icon: <Square size={24} strokeWidth={ICON_STROKE} />, disabled: !busy, onClick: () => dismiss(onStop) },
            coordinator
              ? {
                  id: 'restart',
                  label: 'Start over',
                  icon: <RotateCcw size={24} strokeWidth={ICON_STROKE} />,
                  actions: [
                    { id: 'restart', label: 'Start over', onSelect: () => dismiss(onStartOver) },
                    { id: 'cancel', label: 'Cancel', dismiss: true },
                  ],
                }
              : {
                  id: 'end',
                  label: 'End agent',
                  icon: <Power size={24} strokeWidth={ICON_STROKE} />,
                  tone: 'danger',
                  disabled: !live,
                  actions: [
                    { id: 'end', label: 'End agent', tone: 'danger', onSelect: () => dismiss(onEndAgent) },
                    { id: 'cancel', label: 'Cancel', dismiss: true },
                  ],
                },
          ]}
        />
      )}
    </Sheet>
  )
}
