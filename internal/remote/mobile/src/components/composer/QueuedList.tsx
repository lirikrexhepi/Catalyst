import { Clock3, X } from '../../icons'

interface QueuedListProps {
  items: { id: string; text: string }[]
  onRemove: (id: string) => void
}

export function QueuedList({ items, onRemove }: QueuedListProps) {
  if (items.length === 0) return null
  return (
    <div className="queued" aria-label="Queued messages">
      {items.map((q) => (
        <div className="queued-chip" key={q.id}>
          <Clock3 size={13} aria-hidden />
          <span>{q.text}</span>
          <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => onRemove(q.id)} aria-label="Remove queued message">
            <X size={14} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  )
}
