/**
 * VS Code's Material Icon Theme for the explorer, shared by the desktop and
 * phone UIs.
 *
 * The theme's own manifest is 450 KB, mostly name variants. This plugin
 * compacts it at build time into `virtual:file-icons` (a resolver of about
 * 120 KB) and serves the SVGs as separate files under `file-icons/`. Each icon
 * is fetched only when a row with it appears, and the browser caches it.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

const VIRTUAL_ID = 'virtual:file-icons'
const RESOLVED_ID = '\0' + VIRTUAL_ID
const URL_DIR = 'file-icons'

interface Manifest {
  iconDefinitions: Record<string, { iconPath: string }>
  fileNames: Record<string, string>
  fileExtensions: Record<string, string>
  folderNames: Record<string, string>
  folderNamesExpanded: Record<string, string>
  file: string
  folder: string
}

/** Strips the prefix/suffix variants the theme lists for every folder name. */
const baseFolderName = (name: string) => name.replace(/^[._-]+|_+$/g, '')

export function fileIcons(options: { packageDirs: string[] }): Plugin {
  const pkg = options.packageDirs.find((dir) => fs.existsSync(path.join(dir, 'dist', 'material-icons.json')))
  if (!pkg) {
    throw new Error(`material-icon-theme not found in: ${options.packageDirs.join(', ')}. Run npm install.`)
  }
  const iconsDir = path.join(pkg, 'icons')
  const manifest: Manifest = JSON.parse(fs.readFileSync(path.join(pkg, 'dist', 'material-icons.json'), 'utf8'))

  // Icon name -> SVG file stem, keeping only icons whose file really exists.
  const stems = new Map<string, string>()
  for (const [name, def] of Object.entries(manifest.iconDefinitions)) {
    const file = path.basename(def.iconPath)
    if (fs.existsSync(path.join(iconsDir, file))) stems.set(name, file.replace(/\.svg$/, ''))
  }
  const table = (source: Record<string, string>) => {
    const out: Record<string, string> = {}
    for (const [key, icon] of Object.entries(source)) {
      const stem = stems.get(icon)
      if (stem) out[key.toLowerCase()] = stem
    }
    return out
  }

  // Keep one entry per folder base name when every variant agrees.
  const folderVariants = new Map<string, Set<string>>()
  for (const [name, icon] of Object.entries(manifest.folderNames)) {
    const base = baseFolderName(name)
    if (!folderVariants.has(base)) folderVariants.set(base, new Set())
    folderVariants.get(base)!.add(icon)
  }
  const folders: Record<string, string> = {}
  for (const [name, icon] of Object.entries(manifest.folderNames)) {
    const base = baseFolderName(name)
    const stem = stems.get(icon)
    if (!stem) continue
    const agreed = folderVariants.get(base)!.size === 1 && manifest.folderNames[base] === icon
    folders[agreed ? base : name.toLowerCase()] = stem
  }

  // Open icons are "<closed>-open" except for a few clones whose file name
  // puts the suffix elsewhere; only those are listed.
  const open: Record<string, string> = {}
  for (const [name, icon] of Object.entries(manifest.folderNames)) {
    const closed = stems.get(icon)
    const opened = stems.get(manifest.folderNamesExpanded[name] ?? '')
    if (closed && opened && opened !== closed + '-open') open[closed] = opened
  }

  const data = {
    open,
    file: stems.get(manifest.file) ?? 'file',
    folder: stems.get(manifest.folder) ?? 'folder',
    names: table(manifest.fileNames),
    exts: table(manifest.fileExtensions),
    folders,
  }

  const code = `
const data = ${JSON.stringify(data)};
const base = import.meta.env.BASE_URL + ${JSON.stringify(URL_DIR + '/')};
const url = (stem) => base + stem + '.svg';

/** Icon for a file: exact name first, then the longest matching extension. */
export function fileIconUrl(name) {
  const lower = name.toLowerCase();
  const exact = data.names[lower];
  if (exact) return url(exact);
  for (let dot = lower.indexOf('.'); dot !== -1; dot = lower.indexOf('.', dot + 1)) {
    const hit = data.exts[lower.slice(dot + 1)];
    if (hit) return url(hit);
  }
  return url(data.file);
}

/** Icon for a folder, open or closed. Every folder icon has an open twin. */
export function folderIconUrl(name, open) {
  const lower = name.toLowerCase();
  const stem = data.folders[lower] || data.folders[lower.replace(/^[._-]+|_+$/g, '')] || data.folder;
  return url(open ? data.open[stem] || stem + '-open' : stem);
}
`

  let base = '/'
  return {
    name: 'file-icons',
    configResolved(config) {
      base = config.base
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined
    },
    load(id) {
      return id === RESOLVED_ID ? code : undefined
    },
    configureServer(server) {
      const prefix = (base.startsWith('/') ? base : '/') + URL_DIR + '/'
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0]
        if (!pathname.startsWith(prefix)) return next()
        const file = path.join(iconsDir, path.basename(pathname))
        if (!file.endsWith('.svg') || !fs.existsSync(file)) return next()
        res.setHeader('Content-Type', 'image/svg+xml')
        res.setHeader('Cache-Control', 'max-age=86400')
        fs.createReadStream(file).pipe(res)
      })
    },
    generateBundle() {
      for (const file of fs.readdirSync(iconsDir)) {
        if (!file.endsWith('.svg')) continue
        this.emitFile({ type: 'asset', fileName: `${URL_DIR}/${file}`, source: fs.readFileSync(path.join(iconsDir, file)) })
      }
    },
  }
}
