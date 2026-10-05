import { X } from '../../icons'
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
          {f.preview ? (
            <img src={f.preview} alt="Attached photo" />
          ) : (
            <span className="thumb-name" title={f.ref.path}>
              {(f.ref.path.split('/').pop() || 'file').slice(0, 18)}
            </span>
          )}
          <button onClick={() => onRemove(i)} aria-label="Remove attachment">
            <X size={12} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  )
}
