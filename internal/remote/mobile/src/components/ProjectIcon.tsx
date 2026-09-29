import { useState, type ReactNode } from 'react'
import { projectIconUrl } from '../api'
import { useShowProjectFavicons } from '../projectIcons'

const failed = new Set<string>()

interface ProjectIconProps {
  projectId?: string
  size?: number
  className?: string
  fallback: ReactNode
}

/** The project's app icon when favicons are enabled and one resolves,
 *  otherwise the caller's folder glyph. */
export function ProjectIcon({ projectId, size = 24, className, fallback }: ProjectIconProps) {
  const show = useShowProjectFavicons()
  const [broken, setBroken] = useState(false)
  if (!show || !projectId || broken || failed.has(projectId)) return <>{fallback}</>
  return (
    <img
      src={projectIconUrl(projectId)}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={className ? `project-favicon ${className}` : 'project-favicon'}
      onError={() => {
        failed.add(projectId)
        setBroken(true)
      }}
    />
  )
}
