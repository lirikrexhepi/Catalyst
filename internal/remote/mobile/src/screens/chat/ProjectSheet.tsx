import { FolderGit2, Plus } from '../../icons'
import { Sheet, SheetList, SheetRow } from '../../components/sheet'
import { ProjectIcon } from '../../components/ProjectIcon'
import { ICON_STROKE } from '../../components/chrome/BarButton'
import type { Project } from '../../types'

interface ProjectSheetProps {
  projects: Project[]
  value: string
  onPick: (path: string) => void
  onAdd: () => void
  onClose: () => void
}

export function ProjectSheet({ projects, value, onPick, onAdd, onClose }: ProjectSheetProps) {
  return (
    <Sheet title="Project" onClose={onClose}>
      {(dismiss) => (
        <SheetList scroll>
          {projects.map((p) => (
            <SheetRow
              key={p.path}
              iconNode={
                <ProjectIcon
                  projectId={p.id}
                  size={22}
                  fallback={<FolderGit2 size={22} strokeWidth={ICON_STROKE} className="sheet-row-icon" aria-hidden />}
                />
              }
              label={p.name}
              selected={p.path === value}
              onClick={() => dismiss(() => onPick(p.path))}
            />
          ))}
          <SheetRow icon={Plus} label="Add project" onClick={() => dismiss(onAdd)} />
        </SheetList>
      )}
    </Sheet>
  )
}
