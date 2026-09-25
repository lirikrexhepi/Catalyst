/**
 * Git decoration styles for explorer rows, matching the marks used in the
 * Changes list: the same letter and colour for a file wherever it appears.
 */
export const STATUS_STYLE: Record<string, { mark: string; tone: string; label: string }> = {
  added: { mark: 'A', tone: 'text-emerald-300', label: 'Added' },
  modified: { mark: 'M', tone: 'text-amber-300', label: 'Modified' },
  deleted: { mark: 'D', tone: 'text-rose-300', label: 'Deleted' },
  renamed: { mark: 'R', tone: 'text-sky-300', label: 'Renamed' },
  copied: { mark: 'C', tone: 'text-sky-300', label: 'Copied' },
  untracked: { mark: 'U', tone: 'text-emerald-300', label: 'Untracked' },
  conflicted: { mark: '!', tone: 'text-rose-400', label: 'Conflicted' },
};

/** Joins a tree path onto the prefix git reports paths from. */
export function repoPath(prefix: string | undefined, path: string): string {
  return prefix ? `${prefix}/${path}` : path;
}
