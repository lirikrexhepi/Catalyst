import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { fileIconUrl, folderIconUrl } from 'virtual:file-icons'
import { api } from '../api'
import type { ChangeStatus, DiffFile, TreeEntry, TreeStatus } from '../workspaceTypes'

/** Letter shown beside a changed file, the same marks as the desktop. */
export const MARKS: Record<ChangeStatus, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  untracked: 'U',
  conflicted: '!',
}

export function StatusMark({ status }: { status?: ChangeStatus }) {
  if (!status) return null
  return <span className={`mark st-${status}`}>{MARKS[status]}</span>
}

export function FileIcon({ name, dir, open }: { name: string; dir?: boolean; open?: boolean }) {
  return <img className="ficon" src={dir ? folderIconUrl(name, Boolean(open)) : fileIconUrl(name)} alt="" draggable={false} />
}

export interface TreeState {
  children: Record<string, TreeEntry[]>
  expanded: Set<string>
  status: TreeStatus | null
  error: string | null
  toggle: (dir: string) => void
  refresh: () => Promise<void>
}

/**
 * Lazily loaded tree for one checkout. Refreshing re-reads the folders that
 * are open and the git status, and never collapses anything.
 */
export function useTree(root: string | null): TreeState {
  const [children, setChildren] = useState<Record<string, TreeEntry[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [status, setStatus] = useState<TreeStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef(root)
  rootRef.current = root
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded

  const load = useCallback(async (dir: string) => {
    const at = rootRef.current
    if (at === null) return
    try {
      const entries = await api.tree(at, dir)
      if (rootRef.current === at) {
        setChildren((prev) => ({ ...prev, [dir]: entries }))
        setError(null)
      }
    } catch (e) {
      if (rootRef.current === at) setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const refresh = useCallback(async () => {
    const at = rootRef.current
    if (at === null) return
    const statusCall = api
      .treeStatus(at)
      .then((s) => rootRef.current === at && setStatus(s))
      .catch(() => rootRef.current === at && setStatus(null))
    await Promise.all([statusCall, ...['', ...expandedRef.current].map(load)])
  }, [load])

  useEffect(() => {
    setChildren({})
    setExpanded(new Set())
    setStatus(null)
    setError(null)
    void refresh()
  }, [root, refresh])

  const toggle = useCallback(
    (dir: string) => {
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(dir)) next.delete(dir)
        else {
          next.add(dir)
          void load(dir)
        }
        return next
      })
    },
    [load],
  )

  return { children, expanded, status, error, toggle, refresh }
}

const INDENT = 16

/** VS Code-style explorer rows with Material icons and git decorations. */
export function Tree({ tree, onOpen }: { tree: TreeState; onOpen: (entry: TreeEntry) => void }) {
  const rows: React.ReactNode[] = []
  const walk = (dir: string, depth: number) => {
    for (const entry of tree.children[dir] ?? []) {
      const open = entry.dir && tree.expanded.has(entry.path)
      const status = entry.dir ? tree.status?.dirs?.[entry.path] : tree.status?.files?.[entry.path]
      rows.push(
        <button
          key={entry.path}
          className={`tree-row${entry.ignored ? ' ignored' : ''}${status ? ` st-${status}` : ''}`}
          style={{ paddingLeft: 12 + depth * INDENT }}
          onClick={() => (entry.dir ? tree.toggle(entry.path) : onOpen(entry))}
        >
          <span className={`chev${open ? ' open' : ''}`} aria-hidden="true">
            {entry.dir && <ChevronRight size={15} />}
          </span>
          <FileIcon name={entry.name} dir={entry.dir} open={open} />
          <span className="name">{entry.name}</span>
          {status && (entry.dir ? <span className="fdot" aria-label="Has changes" /> : <StatusMark status={status} />)}
        </button>,
      )
      if (open) walk(entry.path, depth + 1)
    }
  }
  walk('', 0)

  if (tree.error && rows.length === 0) return <div className="empty">{tree.error}</div>
  if (rows.length === 0) return <div className="empty">Loading files…</div>
  return <div className="tree">{rows}</div>
}

/** One or more file diffs, in the chat's diff styling but full height. */
export function Diffs({ diffs }: { diffs: DiffFile[] }) {
  if (diffs.length === 0) return <div className="empty">No changes.</div>
  return (
    <div className="code">
      {diffs.map((diff) => (
        <section key={`${diff.oldPath ?? ''}${diff.path}`}>
          {diffs.length > 1 && (
            <div className="file-head">
              <FileIcon name={diff.path.split('/').pop() || diff.path} />
              <span className="name">{diff.path}</span>
              <span className="st-added">+{diff.insertions}</span>
              <span className="st-deleted">−{diff.deletions}</span>
            </div>
          )}
          {diff.binary && <div className="note">Binary file, no preview.</div>}
          {(diff.hunks ?? []).map((hunk, i) => (
            <div key={i}>
              <div className="hunk">{hunk.header}</div>
              {hunk.lines.map((line, j) => (
                <div key={j} className={`diff-line${line.kind === 'added' ? ' add' : line.kind === 'removed' ? ' delete' : ''}`}>
                  <span className="ln">{(line.kind === 'removed' ? line.old : line.new) || ''}</span>
                  <span className="mk">{line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' '}</span>
                  <span>{line.content || ' '}</span>
                </div>
              ))}
            </div>
          ))}
          {diff.truncated && <div className="note">Diff truncated, the file is too large to show in full.</div>}
        </section>
      ))}
    </div>
  )
}

/** A file's text with line numbers. */
export function Code({ text, truncated }: { text: string; truncated?: boolean }) {
  const lines = text.split('\n')
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return (
    <div className="code">
      {lines.map((line, i) => (
        <div key={i} className="code-line">
          <span className="ln">{i + 1}</span>
          <span>{line || ' '}</span>
        </div>
      ))}
      {truncated && <div className="note">Showing the first part of this file.</div>}
    </div>
  )
}
