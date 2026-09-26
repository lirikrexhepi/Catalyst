import { FolderGit2, Plus } from 'lucide-react'
import { Sheet, SheetList, SheetRow } from '../../components/sheet'
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
            <SheetRow key={p.path} icon={FolderGit2} label={p.name} selected={p.path === value} onClick={() => dismiss(() => onPick(p.path))} />
          ))}
          <SheetRow icon={Plus} label="Add project" onClick={() => dismiss(onAdd)} />
        </SheetList>
      )}
    </Sheet>
  )
}
