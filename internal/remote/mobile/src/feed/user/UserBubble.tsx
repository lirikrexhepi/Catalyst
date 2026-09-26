import { FileText } from 'lucide-react'
import { GlassSquircle, Squircle } from '../../ui'
import { basename } from '../../format'
import type { UserMessageFile } from '../types'
import { useUploadPreview } from './useUploadPreview'

interface UserBubbleProps {
  content: string
  files?: UserMessageFile[]
  pending?: boolean
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|heic|heif|bmp|avif)$/i

function isImage(file: UserMessageFile): boolean {
  return file.mime ? file.mime.startsWith('image/') : IMAGE_EXT.test(file.path)
}

function Attachment({ file }: { file: UserMessageFile }) {
  const image = isImage(file)
  const url = useUploadPreview(file.path, image)
  const name = file.name || basename(file.path)
  if (image && url) {
    return (
      <Squircle width={48} height={36} radius={8} className="bubble-thumb" title={name}>
        <img src={url} alt={name} draggable={false} />
      </Squircle>
    )
  }
  return (
    <span className="bubble-file" title={name}>
      <FileText size={13} strokeWidth={1.75} aria-hidden />
      <span>{name}</span>
    </span>
  )
}

export function UserBubble({ content, files, pending }: UserBubbleProps) {
  return (
    <GlassSquircle radius={24} fill="var(--composer-fill)" className={pending ? 'bubble-user2 pending' : 'bubble-user2'}>
      {content ? <div className="bubble-text">{content}</div> : null}
      {files && files.length > 0 ? (
        <div className="bubble-files">
          {files.map((f) => (
            <Attachment key={f.path} file={f} />
          ))}
        </div>
      ) : null}
    </GlassSquircle>
  )
}
