import React, { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronLeft, GitBranch, Menu, Play, RefreshCw } from 'lucide-react'
import Sheet from '../components/Sheet'
import { Code, Diffs, FileIcon, StatusMark, Tree, useTree } from '../components/Explorer'
import { api } from '../api'
import { message } from '../store'
import type { Checkout, DiffFile, FileChange, FileContent, TreeEntry } from '../workspaceTypes'
import type { DevServer } from '../types'
import { PreviewLauncher, PreviewScreen } from './Preview'

type Tab = 'files' | 'changes' | 'history'

/** What the full-screen viewer shows: a file (with its diff when changed) or a commit. */
type Viewing =
  | { kind: 'file'; path: string; title: string; diff?: { file: string; staged: boolean } }
  | { kind: 'commit'; sha: string; title: string }

const baseName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() || path
const dirName = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')

/**
 * One project on the phone: its files as a VS Code-style tree, its
 * uncommitted changes and its history. Agent worktrees are switchable from
 * the title, so what an agent changed can be reviewed from the couch.
 */
export default function ProjectScreen({ path, openDrawer }: { path: string; openDrawer: () => void }) {
  const [checkouts, setCheckouts] = useState<Checkout[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [gitError, setGitError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('files')
  const [picking, setPicking] = useState(false)
  const [viewing, setViewing] = useState<Viewing | null>(null)
  const [previewing, setPreviewing] = useState<'pick' | DevServer | null>(null)

  const checkout = checkouts.find((c) => c.path === active) ?? checkouts.find((c) => c.isMain) ?? null
  // A folder that is not a git repository still gets a tree, without git.
  const root = checkout?.path ?? (gitError !== null ? path : null)
  const tree = useTree(root)

  const loadGit = useCallback(async () => {
    try {
      const next = await api.gitOverview(path)
      setCheckouts(next)
      setGitError(null)
    } catch (e) {
      setCheckouts([])
      setGitError(message(e))
    }
  }, [path])

  useEffect(() => {
    setActive(null)
    setTab('files')
    setViewing(null)
    void loadGit()
  }, [loadGit])

  const refresh = useCallback(() => {
    void loadGit()
    void tree.refresh()
  }, [loadGit, tree])

  // Agents keep working while this is open; a slow poll keeps the marks honest.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, 8000)
    return () => window.clearInterval(id)
  }, [refresh])

  const changes = checkout?.files ?? []
  const commits = checkout?.commits ?? []
  const isGit = checkouts.length > 0

  const openEntry = (entry: TreeEntry) => {
    const status = tree.status?.files?.[entry.path]
    const prefix = tree.status?.prefix
    setViewing({
      kind: 'file',
      path: entry.path,
      title: entry.name,
      diff:
        status && status !== 'deleted'
          ? { file: prefix ? `${prefix}/${entry.path}` : entry.path, staged: Boolean(tree.status?.staged?.[entry.path]) }
          : undefined,
    })
  }

  const openChange = (change: FileChange) => {
    const prefix = tree.status?.prefix
    const treePath = prefix && change.path.startsWith(prefix + '/') ? change.path.slice(prefix.length + 1) : change.path
    setViewing({ kind: 'file', path: treePath, title: baseName(change.path), diff: { file: change.path, staged: change.staged } })
  }

  const staged = changes.filter((c) => c.staged)
  const unstaged = changes.filter((c) => !c.staged)

  return (
    <div className="screen">
      <header className="bar">
        <button className="circle" onClick={openDrawer} aria-label="Open menu">
          <Menu size={21} aria-hidden="true" />
        </button>
        <button className="title-pill" onClick={() => checkouts.length > 1 && setPicking(true)} aria-label="Switch checkout">
          <span>{checkout && !checkout.isMain ? checkout.title : baseName(path)}</span>
          {checkouts.length > 1 && <ChevronDown size={16} aria-hidden="true" />}
        </button>
        <span className="spacer" />
        <button className="circle" onClick={() => setPreviewing('pick')} aria-label="Preview the site">
          <Play size={18} aria-hidden="true" />
        </button>
        <button className="circle" onClick={refresh} aria-label="Refresh">
          <RefreshCw size={18} aria-hidden="true" />
        </button>
      </header>
      {checkout && (
        <div className="chat-title">
          <GitBranch size={12} aria-hidden="true" style={{ verticalAlign: '-1px', marginRight: 4 }} />
          {checkout.branch || 'detached'}
          {checkout.ahead > 0 ? ` · ${checkout.ahead} ahead` : ''}
        </div>
      )}

      {isGit && (
        <div className="seg" role="tablist">
          {(['files', 'changes', 'history'] as const).map((t) => (
            <button key={t} role="tab" aria-pressed={tab === t} onClick={() => setTab(t)}>
              {t === 'files' ? 'Files' : t === 'changes' ? `Changes${changes.length ? ` ${changes.length}` : ''}` : 'History'}
            </button>
          ))}
        </div>
      )}

      <div className="scroll">
        {tab === 'files' && <Tree tree={tree} onOpen={openEntry} />}

        {tab === 'changes' &&
          (changes.length === 0 ? (
            <div className="empty">
              <strong>Working tree clean</strong>
              {checkout?.error || 'No uncommitted changes.'}
            </div>
          ) : (
            <>
              {[
                ['Staged', staged],
                ['Changes', unstaged],
              ].map(([label, list]) =>
                (list as FileChange[]).length === 0 ? null : (
                  <section key={label as string}>
                    <div className="nav-h">{label as string}</div>
                    {(list as FileChange[]).map((c, i) => (
                      <button key={`${c.path}-${i}`} className="change-row" onClick={() => openChange(c)}>
                        <FileIcon name={baseName(c.path)} />
                        <span className="grow">
                          <span className="name">{baseName(c.path)}</span>
                          {dirName(c.path) && <span className="sub">{dirName(c.path)}</span>}
                        </span>
                        {!c.binary && (c.insertions > 0 || c.deletions > 0) && (
                          <span className="counts">
                            <span className="st-added">+{c.insertions}</span> <span className="st-deleted">−{c.deletions}</span>
                          </span>
                        )}
                        <StatusMark status={c.status} />
                      </button>
                    ))}
                  </section>
                ),
              )}
            </>
          ))}

        {tab === 'history' &&
          (commits.length === 0 ? (
            <div className="empty">No commits on this branch yet.</div>
          ) : (
            <div className="tree">
              {commits.map((c) => (
                <button key={c.sha} className="change-row" onClick={() => setViewing({ kind: 'commit', sha: c.sha, title: c.subject })}>
                  <span className={`cdot${c.onBase ? ' base' : ''}`} aria-hidden="true" />
                  <span className="grow">
                    <span className="name">{c.subject}</span>
                    <span className="sub">
                      {c.short} · {c.author}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ))}
      </div>

      {viewing && root && (
        <Viewer root={root} checkout={checkout?.path ?? root} viewing={viewing} onBack={() => setViewing(null)} />
      )}

      {previewing === 'pick' && (
        <PreviewLauncher threadId={null} canAsk={false} onClose={() => setPreviewing(null)} onOpen={setPreviewing} />
      )}
      {previewing && previewing !== 'pick' && (
        <PreviewScreen port={previewing.port} name={previewing.name || 'Dev server'} onBack={() => setPreviewing(null)} />
      )}

      {picking && (
        <Sheet title="Checkout" onClose={() => setPicking(false)}>
          <div className="list">
            {checkouts.map((c) => (
              <button
                key={c.path}
                aria-pressed={c.path === checkout?.path}
                onClick={() => {
                  setActive(c.path)
                  setViewing(null)
                  setPicking(false)
                }}
              >
                <GitBranch size={18} aria-hidden="true" />
                <span style={{ flex: 1, minWidth: 0 }}>
                  {c.isMain ? 'Project' : c.title}
                  <span className="sub" style={{ display: 'block' }}>
                    {c.branch}
                    {c.files?.length ? ` · ${c.files.length} changed` : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  )
}

/** Full-screen file or commit view, sliding over the project like an iOS push. */
function Viewer({ root, checkout, viewing, onBack }: { root: string; checkout: string; viewing: Viewing; onBack: () => void }) {
  const hasDiff = viewing.kind === 'commit' || Boolean(viewing.kind === 'file' && viewing.diff)
  const [mode, setMode] = useState<'diff' | 'file'>(hasDiff ? 'diff' : 'file')
  const [diffs, setDiffs] = useState<DiffFile[] | null>(null)
  const [content, setContent] = useState<FileContent | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    setError(null)
    const fail = (e: unknown) => current && setError(message(e))
    if (mode === 'diff') {
      setDiffs(null)
      if (viewing.kind === 'commit') api.gitCommit(checkout, viewing.sha).then((d) => current && setDiffs(d), fail)
      else if (viewing.diff) api.gitDiff(checkout, viewing.diff.file, viewing.diff.staged).then((d) => current && setDiffs([d]), fail)
    } else if (viewing.kind === 'file') {
      setContent(null)
      api.file(root, viewing.path).then((c) => current && setContent(c), fail)
    }
    return () => {
      current = false
    }
  }, [mode, viewing, root, checkout])

  return (
    <div className="screen viewer">
      <header className="bar">
        <button className="circle" onClick={onBack} aria-label="Back">
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <div className="viewer-title">
          {viewing.kind === 'file' && <FileIcon name={viewing.title} />}
          <span>{viewing.title}</span>
        </div>
      </header>
      {viewing.kind === 'file' && viewing.diff && (
        <div className="seg">
          <button aria-pressed={mode === 'diff'} onClick={() => setMode('diff')}>
            Diff
          </button>
          <button aria-pressed={mode === 'file'} onClick={() => setMode('file')}>
            File
          </button>
        </div>
      )}
      {viewing.kind === 'file' && <div className="chat-title">{viewing.path}</div>}
      <div className="scroll">
        {error ? (
          <div className="empty">{error}</div>
        ) : mode === 'diff' ? (
          diffs ? <Diffs diffs={diffs} /> : <div className="empty">Loading diff…</div>
        ) : !content ? (
          <div className="empty">Loading file…</div>
        ) : content.binary ? (
          <div className="empty">Binary file, no preview.</div>
        ) : (
          <Code text={content.text ?? ''} truncated={content.truncated} />
        )}
      </div>
    </div>
  )
}
