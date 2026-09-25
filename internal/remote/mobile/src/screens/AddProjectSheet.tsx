import React, { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Folder, GitBranch, HardDrive, Home } from 'lucide-react'
import Sheet from '../components/Sheet'
import { api } from '../api'
import { message } from '../store'
import type { Project } from '../types'
import type { FolderListing, Place } from '../workspaceTypes'

/**
 * Pick a folder on the PC and save it as a project, the phone's version of
 * the desktop folder dialog. It starts at home and the drives and walks down
 * one folder at a time.
 */
export default function AddProjectSheet({ onClose, onAdded }: { onClose: () => void; onAdded: (project: Project) => void }) {
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

  const add = async () => {
    if (!folder) return
    setBusy(true)
    setError(null)
    try {
      onAdded(await api.addProject(folder.path))
    } catch (e) {
      setError(message(e))
      setBusy(false)
    }
  }

  const name = folder ? folder.path.split(/[\\/]/).filter(Boolean).pop() || folder.path : ''

  return (
    <Sheet
      title="Add project"
      onClose={onClose}
      footer={
        <button className="btn primary grow" disabled={!folder || busy} onClick={() => void add()}>
          {folder ? `Add ${name}` : 'Choose a folder'}
        </button>
      }
    >
      {error && <div className="say error">{error}</div>}
      {folder && (
        <div>
          <span className="label">Folder</span>
          <div className="picker-path">
            {folder.isGit && <GitBranch size={14} aria-hidden="true" />}
            <span>{folder.path}</span>
          </div>
        </div>
      )}
      <div className="list">
        {folder ? (
          <button onClick={() => open(folder.parent ?? null)}>
            <ChevronLeft size={18} aria-hidden="true" />
            <span style={{ flex: 1 }}>{folder.parent ? 'Up' : 'All locations'}</span>
          </button>
        ) : (
          places.map((p) => (
            <button key={p.path} onClick={() => open(p.path)}>
              {p.name === 'Home' ? <Home size={18} aria-hidden="true" /> : /^[A-Z]:$/.test(p.name) ? <HardDrive size={18} aria-hidden="true" /> : <Folder size={18} aria-hidden="true" />}
              <span style={{ flex: 1, minWidth: 0 }}>
                {p.name}
                <span className="sub" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.path}
                </span>
              </span>
              <ChevronRight size={16} aria-hidden="true" style={{ color: 'var(--text-3)' }} />
            </button>
          ))
        )}
        {folder?.folders.map((f) => (
          <button key={f.path} onClick={() => open(f.path)}>
            <Folder size={18} aria-hidden="true" />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
            <ChevronRight size={16} aria-hidden="true" style={{ color: 'var(--text-3)' }} />
          </button>
        ))}
        {folder && folder.folders.length === 0 && <div className="empty" style={{ padding: 20 }}>No folders inside.</div>}
      </div>
    </Sheet>
  )
}
