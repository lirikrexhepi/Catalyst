import { ChevronRight, FolderGit2, Zap } from 'lucide-react'
import { GlassSwitch } from '../../ui'
import { ProjectIcon } from '../../components/ProjectIcon'

interface StartOptionsProps {
  projectName?: string
  projectId?: string
  onProject: () => void
  autoApprove: boolean
  onAutoApprove: (next: boolean) => void
}

const ICON = { size: 22, strokeWidth: 1.75 } as const

export function StartOptions({ projectName, projectId, onProject, autoApprove, onAutoApprove }: StartOptionsProps) {
  return (
    <div className="start-options">
      <button className="start-row" onClick={onProject}>
        <ProjectIcon
          projectId={projectId}
          size={22}
          fallback={<FolderGit2 {...ICON} className="start-icon" aria-hidden />}
        />
        <span className="start-label">Project</span>
        <span className="start-value">{projectName ?? 'Choose'}</span>
        <ChevronRight size={16} strokeWidth={2} className="start-chevron" aria-hidden />
      </button>
      <div className="start-row" role="group">
        <Zap {...ICON} className="start-icon" aria-hidden />
        <span className="start-label">Run without asking</span>
        <GlassSwitch checked={autoApprove} onChange={onAutoApprove} label="Run without asking" />
      </div>
    </div>
  )
}
