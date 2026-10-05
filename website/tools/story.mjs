const MIN = 60_000
const HOUR = 3_600_000
export const now = Date.now()

const effort = (ids, def) => ({
  id: 'effort',
  label: 'Reasoning',
  type: 'select',
  default: def,
  choices: ids.map((id) => ({
    id,
    label: id === 'xhigh' ? 'Extra High' : id.charAt(0).toUpperCase() + id.slice(1),
    default: id === def,
  })),
})
const levels = effort(['low', 'medium', 'high', 'xhigh', 'max'], 'high')

export const providers = [
  {
    driver: 'claude',
    name: 'Claude Code',
    accounts: [
      { id: 'personal', name: 'Personal' },
      { id: 'work', name: 'Studio' },
    ],
    models: [
      { id: 'fable-5', name: 'Claude Fable 5', options: [levels] },
      { id: 'opus-5', name: 'Claude Opus 5', default: true, options: [levels] },
      { id: 'sonnet-5', name: 'Claude Sonnet 5', options: [levels] },
      { id: 'haiku-4.5', name: 'Claude Haiku 4.5', options: [{ id: 'thinking', label: 'Thinking', type: 'boolean', default: false }] },
    ],
  },
  {
    driver: 'codex',
    name: 'Codex',
    models: [
      { id: 'gpt-5-codex', name: 'GPT-5 Codex', options: [effort(['low', 'medium', 'high'], 'medium')] },
      { id: 'gpt-5-mini', name: 'GPT-5 Mini', options: [effort(['low', 'medium', 'high'], 'low')] },
    ],
  },
  {
    driver: 'opencode',
    name: 'OpenCode',
    models: [
      { id: 'big-pickle', name: 'Big Pickle', options: [levels] },
      { id: 'mimo-2.6', name: 'Mimo V2.6 Flash' },
    ],
  },
  {
    driver: 'antigravity',
    name: 'Antigravity',
    models: [{ id: 'gemini', name: 'Gemini 3 Pro', options: [effort(['low', 'high'], 'high')] }],
  },
]

export const projects = [
  { id: 'atlas', path: 'C:/code/atlas', name: 'Atlas', totalAgents: 6, runningAgents: 2, lastActivity: now - 2 * MIN },
  { id: 'ledger', path: 'C:/code/ledger-api', name: 'Ledger API', totalAgents: 4, runningAgents: 1, lastActivity: now - 18 * MIN },
  { id: 'harbor', path: 'C:/code/harbor', name: 'Harbor', totalAgents: 3, runningAgents: 0, lastActivity: now - 5 * HOUR },
  { id: 'meridian', path: 'C:/code/meridian', name: 'Meridian', totalAgents: 2, runningAgents: 0, lastActivity: now - 26 * HOUR },
]

const summary = (threadId, title, extra) => ({
  threadId,
  title,
  kind: 'agent',
  driver: 'claude',
  drivers: ['claude'],
  model: 'opus-5',
  live: true,
  busy: false,
  attention: '',
  projectName: 'Atlas',
  projectCwd: 'C:/code/atlas',
  cwd: 'C:/code/atlas',
  branch: 'main',
  ...extra,
})

export const THREAD_MAIN = 'atlas-darkmode'
export const THREAD_ASK = 'ledger-migrate'
export const THREAD_QUESTION = 'atlas-exports'

export const summaries = [
  summary(THREAD_MAIN, 'Add a dark mode toggle to settings', {
    busy: true,
    turnStartedAt: now - 3 * MIN,
    lastActivity: now - 6_000,
    preview: 'Wiring the toggle into Appearance',
    branch: 'agent/dark-mode',
  }),
  summary(THREAD_ASK, 'Migrate invoices table to UUID keys', {
    driver: 'codex',
    drivers: ['codex'],
    model: 'gpt-5-codex',
    projectName: 'Ledger API',
    projectCwd: 'C:/code/ledger-api',
    cwd: 'C:/code/ledger-api',
    attention: 'approval',
    lastActivity: now - 9 * MIN,
    branch: 'agent/uuid-keys',
  }),
  summary(THREAD_QUESTION, 'CSV export for the reports page', {
    attention: 'question',
    lastActivity: now - 22 * MIN,
    drivers: ['claude', 'antigravity'],
    branch: 'agent/csv-export',
  }),
  summary('atlas-flaky', 'Fix the flaky date range test', {
    live: false,
    lastActivity: now - 54 * MIN,
    lastTurnMs: 214_000,
    preview: 'Fixed. The test was reading the wall clock.',
    drivers: ['opencode', 'claude'],
  }),
  summary('atlas-skeleton', 'Skeleton loaders for the charts', {
    live: false,
    lastActivity: now - 3 * HOUR,
    lastTurnMs: 402_000,
    driver: 'antigravity',
    drivers: ['antigravity'],
    model: 'gemini',
  }),
  summary('harbor-queue', 'Retry failed webhook deliveries', {
    live: false,
    projectName: 'Harbor',
    projectCwd: 'C:/code/harbor',
    cwd: 'C:/code/harbor',
    lastActivity: now - 5 * HOUR,
    lastTurnMs: 618_000,
    driver: 'codex',
    drivers: ['codex'],
    model: 'gpt-5-codex',
  }),
  summary('ledger-docs', 'Document the invoices endpoints', {
    live: false,
    projectName: 'Ledger API',
    projectCwd: 'C:/code/ledger-api',
    lastActivity: now - 7 * HOUR,
    lastTurnMs: 96_000,
    driver: 'claude',
    model: 'sonnet-5',
  }),
  summary('atlas-a11y', 'Audit keyboard navigation in the sidebar', {
    live: false,
    lastActivity: now - 27 * HOUR,
    lastTurnMs: 301_000,
  }),
  summary('meridian-push', 'Push notification permission flow', {
    live: false,
    projectName: 'Meridian',
    projectCwd: 'C:/code/meridian',
    lastActivity: now - 29 * HOUR,
    lastTurnMs: 255_000,
    driver: 'opencode',
    drivers: ['opencode'],
    model: 'big-pickle',
  }),
  summary('harbor-logs', 'Trim noisy request logging', {
    live: false,
    projectName: 'Harbor',
    projectCwd: 'C:/code/harbor',
    lastActivity: now - 31 * HOUR,
    lastTurnMs: 71_000,
  }),
]

let seq = 0
const ev = (kind, threadId, at, fields = {}) => ({ kind, threadId, seq: ++seq, at, driver: 'claude', ...fields })

const call = (threadId, at, id, name, input, output, extra = {}) => [
  ev('tool.call', threadId, at, { tool: { id, name, status: 'in_progress', input, ...extra } }),
  ev('tool.result', threadId, at + 900, { tool: { id, name, status: 'completed', output, ...extra } }),
]

export function mainEvents() {
  seq = 0
  const t = THREAD_MAIN
  const start = now - 3 * MIN
  const turn = 't1'
  return [
    ev('user.message', t, start, { turnId: turn, text: 'Add a dark mode toggle to the settings page. It should remember the choice across sessions.' }),
    ev('turn.started', t, start + 200, { turnId: turn }),
    ev('agent.thought', t, start + 1500, {
      turnId: turn,
      itemId: 'th1',
      text: 'The theme is probably set somewhere global. I should read how settings are laid out before touching anything, then keep the change small.',
    }),
    ...call(t, start + 4000, 'c1', 'Grep', { pattern: 'theme', path: 'src' }, 'src/lib/theme.ts\nsrc/app/layout.tsx\nsrc/settings/Appearance.tsx'),
    ...call(t, start + 6000, 'c2', 'Read', { file_path: 'src/settings/Appearance.tsx' }, 'export function Appearance() { ... }'),
    ...call(t, start + 7000, 'c3', 'Read', { file_path: 'src/lib/theme.ts' }, 'export const themes = ["light", "dark"]'),
    ev('agent.message', t, start + 12_000, {
      turnId: turn,
      itemId: 'm1',
      text: 'The theme list already exists in `lib/theme.ts`, but nothing stores the choice and Appearance has no control. I will add a small `useTheme` hook that persists to `localStorage`, then use it in the settings page.',
    }),
    ...call(
      t,
      start + 20_000,
      'c4',
      'Write',
      {
        file_path: 'src/lib/useTheme.ts',
        content:
          "import { useEffect, useState } from 'react'\nimport { themes, type Theme } from './theme'\n\nconst KEY = 'atlas-theme'\n\nexport function useTheme() {\n  const [theme, setTheme] = useState<Theme>(() => {\n    const saved = localStorage.getItem(KEY)\n    return themes.includes(saved as Theme) ? (saved as Theme) : 'light'\n  })\n\n  useEffect(() => {\n    document.documentElement.dataset.theme = theme\n    localStorage.setItem(KEY, theme)\n  }, [theme])\n\n  return [theme, setTheme] as const\n}\n",
      },
      'Created src/lib/useTheme.ts',
    ),
    ...call(
      t,
      start + 30_000,
      'c5',
      'Edit',
      {
        file_path: 'src/settings/Appearance.tsx',
        old_string:
          "export function Appearance() {\n  return (\n    <Section title=\"Appearance\">\n      <Row label=\"Density\" />\n    </Section>\n  )\n}",
        new_string:
          "export function Appearance() {\n  const [theme, setTheme] = useTheme()\n  return (\n    <Section title=\"Appearance\">\n      <Row label=\"Dark mode\">\n        <Switch checked={theme === 'dark'} onChange={(on) => setTheme(on ? 'dark' : 'light')} />\n      </Row>\n      <Row label=\"Density\" />\n    </Section>\n  )\n}",
      },
      'Edited src/settings/Appearance.tsx',
    ),
    ...call(
      t,
      start + 44_000,
      'c6',
      'Bash',
      { command: 'npm test -- theme' },
      ' PASS  src/lib/useTheme.test.ts\n  useTheme\n    âœ“ defaults to light (4 ms)\n    âœ“ restores the saved theme (2 ms)\n    âœ“ writes the choice to localStorage (2 ms)\n\nTests: 3 passed, 3 total',
    ),
    ev('agent.message', t, start + 52_000, {
      turnId: turn,
      itemId: 'm2',
      text: 'Dark mode is in. The toggle sits at the top of **Appearance** and the choice survives a reload.\n\n- `lib/useTheme.ts` reads and writes `atlas-theme`\n- `settings/Appearance.tsx` gets the switch\n- three new tests, all passing\n\nI have not touched the chart colors yet. They still use fixed values, so they will need a pass next.',
    }),
    ev('turn.completed', t, start + 54_000, { turnId: turn }),
  ]
}

export function phoneEvents(live) {
  seq = 0
  const t = THREAD_MAIN
  const start = now - (live ? 70_000 : 3 * MIN)
  const turn = 'p1'
  const list = [
    ev('user.message', t, start, { turnId: turn, text: 'Add a dark mode toggle to settings. It should remember the choice.' }),
    ev('turn.started', t, start + 200, { turnId: turn }),
    ev('agent.thought', t, start + 1500, {
      turnId: turn,
      itemId: 'th1',
      text: 'Theme lives somewhere global. Read how settings are laid out first, then keep the change small.',
    }),
    ...call(t, start + 4000, 'c1', 'Grep', { pattern: 'theme', path: 'src' }, 'src/lib/theme.ts\nsrc/settings/Appearance.tsx'),
    ...call(t, start + 6000, 'c2', 'Read', { file_path: 'src/settings/Appearance.tsx' }, 'export function Appearance() { ... }'),
    ...call(t, start + 7000, 'c3', 'Read', { file_path: 'src/lib/theme.ts' }, 'export const themes = ["light", "dark"]'),
    ev('agent.message', t, start + 12_000, {
      turnId: turn,
      itemId: 'm1',
      text: 'Nothing stores the choice yet. I will add a `useTheme` hook and use it in Appearance.',
    }),
    ...call(
      t,
      start + 30_000,
      'c5',
      'Edit',
      {
        file_path: 'src/settings/Appearance.tsx',
        old_string:
          "export function Appearance() {\n  return (\n    <Section title=\"Appearance\">\n      <Row label=\"Density\" />\n    </Section>\n  )\n}",
        new_string:
          "export function Appearance() {\n  const [theme, setTheme] = useTheme()\n  return (\n    <Section title=\"Appearance\">\n      <Row label=\"Dark mode\">\n        <Switch checked={theme === 'dark'} onChange={(on) => setTheme(on ? 'dark' : 'light')} />\n      </Row>\n      <Row label=\"Density\" />\n    </Section>\n  )\n}",
      },
      'Edited src/settings/Appearance.tsx',
    ),
  ]
  if (live) {
    list.push(ev('tool.call', t, start + 44_000, { turnId: turn, tool: { id: 'c6', name: 'Bash', status: 'in_progress', input: { command: 'npm test -- theme' } } }))
    return list
  }
  list.push(
    ...call(t, start + 44_000, 'c6', 'Bash', { command: 'npm test -- theme' }, ' PASS  src/lib/useTheme.test.ts\n\nTests: 3 passed, 3 total'),
    ev('agent.message', t, start + 52_000, {
      turnId: turn,
      itemId: 'm2',
      text: 'Done. The toggle sits at the top of **Appearance** and the choice survives a reload. Three new tests pass.',
    }),
    ev('turn.completed', t, start + 54_000, { turnId: turn }),
  )
  return list
}

export function askEvents() {
  const t = THREAD_ASK
  const start = now - 14 * MIN
  const turn = 'a1'
  const e = (kind, at, fields = {}) => ({ kind, threadId: t, seq: 0, at, driver: 'codex', ...fields })
  const list = [
    e('user.message', start, { turnId: turn, text: 'Migrate the invoices table from serial ids to UUIDs. Keep a rollback.' }),
    e('turn.started', start + 100, { turnId: turn }),
    e('agent.message', start + 3000, {
      turnId: turn,
      itemId: 'm1',
      text: 'I wrote the migration and a matching rollback. Before I run it against the dev database I need your go-ahead.',
    }),
    e('approval.request', start + 9000, {
      turnId: turn,
      approval: {
        requestId: 'r1',
        title: 'Run database migration',
        detail: 'npx prisma migrate dev --name invoices_uuid',
        options: [
          { id: 'allow', name: 'Allow', kind: 'allow_once' },
          { id: 'reject', name: 'Deny', kind: 'reject_once' },
        ],
      },
    }),
  ]
  return list.map((x, i) => ({ ...x, seq: i + 1 }))
}

export function questionEvents() {
  const t = THREAD_QUESTION
  const start = now - 26 * MIN
  const e = (kind, at, fields = {}) => ({ kind, threadId: t, seq: 0, at, driver: 'claude', ...fields })
  const list = [
    e('user.message', start, { turnId: 'q1', text: 'Add a CSV export to the reports page.' }),
    e('turn.started', start + 100, { turnId: 'q1' }),
    e('agent.message', start + 3000, { turnId: 'q1', itemId: 'm1', text: 'The reports table already has everything I need. One thing is unclear before I write the exporter.' }),
    e('question.asked', start + 8000, {
      turnId: 'q1',
      question: {
        requestId: 'qq1',
        questions: [
          {
            question: 'Which rows should the export include?',
            options: ['Only the rows currently filtered', 'Every row in the date range', 'Everything, ignoring filters'],
          },
        ],
      },
    }),
  ]
  return list.map((x, i) => ({ ...x, seq: i + 1 }))
}

export const checkouts = [
  {
    title: 'Project',
    path: 'C:/code/atlas',
    branch: 'main',
    isMain: true,
    orphaned: false,
    ahead: 0,
    files: [
      { path: 'src/lib/useTheme.ts', status: 'added', staged: false, insertions: 18, deletions: 0, binary: false },
      { path: 'src/settings/Appearance.tsx', status: 'modified', staged: false, insertions: 6, deletions: 1, binary: false },
      { path: 'src/lib/useTheme.test.ts', status: 'added', staged: true, insertions: 31, deletions: 0, binary: false },
    ],
    commits: [
      { sha: 'a91f3c2d', short: 'a91f3c2', subject: 'Release 2.4.0', author: 'Mara', at: now - 2 * HOUR, onBase: true },
      { sha: 'c4e8b71a', short: 'c4e8b71', subject: 'Tighten chart tooltips', author: 'Mara', at: now - 9 * HOUR, onBase: true },
      { sha: '7d20e5f0', short: '7d20e5f', subject: 'Add date range presets', author: 'Jonas', at: now - 30 * HOUR, onBase: true },
    ],
  },
  {
    threadId: THREAD_MAIN,
    title: 'Add a dark mode toggle',
    path: 'C:/code/atlas-wt/dark-mode',
    branch: 'agent/dark-mode',
    base: 'main',
    isMain: false,
    orphaned: false,
    ahead: 1,
    files: [
      { path: 'src/lib/useTheme.ts', status: 'added', staged: false, insertions: 18, deletions: 0, binary: false },
      { path: 'src/settings/Appearance.tsx', status: 'modified', staged: false, insertions: 6, deletions: 1, binary: false },
      { path: 'src/lib/useTheme.test.ts', status: 'added', staged: true, insertions: 31, deletions: 0, binary: false },
    ],
    commits: [{ sha: 'e1b22f90', short: 'e1b22f9', subject: 'Add theme hook', author: 'Agent', at: now - 4 * MIN, onBase: false }],
  },
]

export const diffFile = {
  path: 'src/settings/Appearance.tsx',
  insertions: 6,
  deletions: 1,
  binary: false,
  truncated: false,
  hunks: [
    {
      header: '@@ -4,7 +4,12 @@ export function Appearance() {',
      lines: [
        { kind: 'context', old: 4, new: 4, content: 'import { Row, Section } from "./parts"' },
        { kind: 'context', old: 5, new: 5, content: 'import { Switch } from "../ui/Switch"' },
        { kind: 'added', new: 6, content: 'import { useTheme } from "../lib/useTheme"' },
        { kind: 'context', old: 6, new: 7, content: '' },
        { kind: 'context', old: 7, new: 8, content: 'export function Appearance() {' },
        { kind: 'added', new: 9, content: '  const [theme, setTheme] = useTheme()' },
        { kind: 'context', old: 8, new: 10, content: '  return (' },
        { kind: 'context', old: 9, new: 11, content: '    <Section title="Appearance">' },
        { kind: 'added', new: 12, content: '      <Row label="Dark mode">' },
        { kind: 'added', new: 13, content: "        <Switch checked={theme === 'dark'} onChange={(on) => setTheme(on ? 'dark' : 'light')} />" },
        { kind: 'added', new: 14, content: '      </Row>' },
        { kind: 'removed', old: 10, content: '      <Row label="Density" />' },
        { kind: 'added', new: 15, content: '      <Row label="Density" />' },
        { kind: 'context', old: 11, new: 16, content: '    </Section>' },
      ],
    },
  ],
}

export const tree = {
  '': [
    { name: 'src', path: 'src', dir: true },
    { name: 'public', path: 'public', dir: true },
    { name: 'tests', path: 'tests', dir: true },
    { name: '.gitignore', path: '.gitignore', dir: false, size: 40 },
    { name: 'package.json', path: 'package.json', dir: false, size: 1200 },
    { name: 'README.md', path: 'README.md', dir: false, size: 2100 },
    { name: 'tsconfig.json', path: 'tsconfig.json', dir: false, size: 600 },
    { name: 'vite.config.ts', path: 'vite.config.ts', dir: false, size: 700 },
  ],
  src: [
    { name: 'lib', path: 'src/lib', dir: true },
    { name: 'settings', path: 'src/settings', dir: true },
    { name: 'charts', path: 'src/charts', dir: true },
    { name: 'App.tsx', path: 'src/App.tsx', dir: false, size: 1800 },
    { name: 'main.tsx', path: 'src/main.tsx', dir: false, size: 300 },
  ],
  'src/lib': [
    { name: 'theme.ts', path: 'src/lib/theme.ts', dir: false, size: 400 },
    { name: 'useTheme.ts', path: 'src/lib/useTheme.ts', dir: false, size: 700 },
    { name: 'useTheme.test.ts', path: 'src/lib/useTheme.test.ts', dir: false, size: 900 },
  ],
  'src/settings': [
    { name: 'Appearance.tsx', path: 'src/settings/Appearance.tsx', dir: false, size: 600 },
    { name: 'Billing.tsx', path: 'src/settings/Billing.tsx', dir: false, size: 900 },
    { name: 'parts.tsx', path: 'src/settings/parts.tsx', dir: false, size: 500 },
  ],
}

export const treeStatus = {
  isGit: true,
  files: {
    'src/lib/useTheme.ts': 'added',
    'src/lib/useTheme.test.ts': 'added',
    'src/settings/Appearance.tsx': 'modified',
  },
  staged: { 'src/lib/useTheme.test.ts': true },
  dirs: { src: 'modified', 'src/lib': 'modified', 'src/settings': 'modified' },
}

export const servers = [
  {
    threadId: THREAD_MAIN,
    title: 'Add a dark mode toggle',
    servers: [
      {
        pid: 4120,
        port: 5317,
        name: 'Atlas',
        kind: 'vite',
        ownerThreadId: THREAD_MAIN,
        cwd: 'C:/code/atlas-wt/dark-mode',
        preview: { port: 5317, url: 'http://127.0.0.1:5317/settings.html', state: 'live' },
      },
    ],
  },
]

