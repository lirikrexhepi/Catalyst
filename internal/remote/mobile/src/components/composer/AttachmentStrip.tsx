import { X } from 'lucide-react'
import type { Attachment } from './useAttachments'

interface AttachmentStripProps {
  files: Attachment[]
  onRemove: (index: number) => void
}

export function AttachmentStrip({ files, onRemove }: AttachmentStripProps) {
  if (files.length === 0) return null
  return (
    <div className="attachments">
      {files.map((f, i) => (
        <div className="thumb" key={f.ref.path}>
          <img src={f.preview} alt="Attached photo" />
          <button onClick={() => onRemove(i)} aria-label="Remove photo">
            <X size={12} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  )
}
