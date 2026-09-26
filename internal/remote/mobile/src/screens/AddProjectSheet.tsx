import { useEffect, useState } from 'react'
import { ChevronLeft, Folder, GitBranch, HardDrive, House } from 'lucide-react'
import { Sheet, SheetEmpty, SheetList, SheetNote, SheetPrimary, SheetRow } from '../components/sheet'
import { GlassCircle } from '../ui'
import { ICON_STROKE } from '../components/chrome/BarButton'
import { api } from '../api'
import { message } from '../store'
import type { Project } from '../types'
import type { FolderListing, Place } from '../workspaceTypes'

interface AddProjectSheetProps {
  onClose: () => void
  onAdded: (project: Project) => void
}

const placeIcon = (p: Place) => (p.name === 'Home' ? House : /^[A-Z]:$/.test(p.name) ? HardDrive : Folder)

const baseName = (path: string) => path.split(/[\/]/).filter(Boolean).pop() || path

export default function AddProjectSheet({ onClose, onAdded }: AddProjectSheetProps) {
  const [places, setPlaces] = useState<Place[]>([])
  const [folder, setFolder] = useState<FolderListing | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .places()
      .then((r) => setPlaces(r.places))
      .catch((e) => setError(message(e)))
  }, [])

  const open = (path: string | null) => {
    setError(null)
    if (path === null) {
      setFolder(null)
      return
    }
    api
      .folder(path)
      .then((r) => setFolder(r.folder))
      .catch((e) => setError(message(e)))
  }

  const name = folder ? baseName(folder.path) : ''

  return (
    <Sheet
      title="Add project"
      onClose={onClose}
      footer={(dismiss) => (
        <SheetPrimary
          disabled={!folder || busy}
          onClick={() => {
            if (!folder) return
            setBusy(true)
            setError(null)
            api
              .addProject(folder.path)
              .then((project) => dismiss(() => onAdded(project)))
              .catch((e) => {
                setError(message(e))
                setBusy(false)
              })
          }}
        >
          <span>{busy ? 'Adding' : folder ? `Add ${name}` : 'Pick a folder'}</span>
        </SheetPrimary>
      )}
    >
      <div className="folder-head">
        <GlassCircle size={36} fill="var(--glass-control)" disabled={!folder} onClick={() => open(folder?.parent ?? null)} aria-label="Back">
          <ChevronLeft size={20} strokeWidth={ICON_STROKE} aria-hidden />
        </GlassCircle>
        <span className="folder-head-name">{folder ? name : 'Locations'}</span>
        {folder?.isGit ? <GitBranch size={18} strokeWidth={ICON_STROKE} className="folder-head-git" aria-label="Git repository" /> : null}
      </div>
      <SheetList scroll scrollKey={folder?.path ?? ''}>
        {folder
          ? folder.folders.map((f) => <SheetRow key={f.path} icon={Folder} label={f.name} chevron onClick={() => open(f.path)} />)
          : places.map((p) => <SheetRow key={p.path} icon={placeIcon(p)} label={p.name} chevron onClick={() => open(p.path)} />)}
        {folder && folder.folders.length === 0 ? <SheetEmpty>No folders inside</SheetEmpty> : null}
      </SheetList>
      {error ? <SheetNote tone="error">{error}</SheetNote> : null}
    </Sheet>
  )
}
