/** Shapes of the project explorer, git and folder-picker API (see remote/workspace.go). */

export type ChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'untracked' | 'conflicted'

export interface TreeEntry {
  name: string
  /** Relative to the tree root, slash-separated. */
  path: string
  dir: boolean
  size?: number
  symlink?: boolean
  ignored?: boolean
}

export interface TreeStatus {
  isGit: boolean
  repoRoot?: string
  prefix?: string
  files: Record<string, ChangeStatus>
  staged?: Record<string, boolean>
  dirs: Record<string, ChangeStatus>
}

export interface FileContent {
  path: string
  size: number
  binary: boolean
  text?: string
  truncated: boolean
}

export interface FileChange {
  path: string
  oldPath?: string
  status: ChangeStatus
  staged: boolean
  insertions: number
  deletions: number
  binary: boolean
}

export interface DiffLine {
  kind: 'context' | 'added' | 'removed'
  old?: number
  new?: number
  content: string
}

export interface DiffFile {
  path: string
  oldPath?: string
  hunks: { header: string; lines: DiffLine[] }[] | null
  insertions: number
  deletions: number
  binary: boolean
  truncated: boolean
}

export interface Commit {
  sha: string
  short: string
  subject: string
  author: string
  at: number
  onBase: boolean
}

export interface Checkout {
  threadId?: string
  title: string
  path: string
  branch: string
  base?: string
  isMain: boolean
  orphaned: boolean
  files: FileChange[] | null
  commits: Commit[] | null
  ahead: number
  error?: string
}

export interface Place {
  name: string
  path: string
}

export interface FolderListing {
  path: string
  parent?: string
  folders: Place[]
  isGit: boolean
}
