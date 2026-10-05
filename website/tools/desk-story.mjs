const MIN = 60_000
const HOUR = 3_600_000
export const now = Date.now()

export const WORKSPACE = 'ws-atlas-1'
export const CWD = 'C:/code/atlas'

const model = (id, displayName, options, def) => ({ id, displayName, default: def, options })
const effortOpt = (ids, def) => ({
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
const levels = effortOpt(['low', 'medium', 'high', 'xhigh', 'max'], 'high')

const snapshot = (driver, displayName, models, extra = {}) => ({
  instanceId: driver,
  driver,
  displayName,
  availability: 'ready',
  version: '1.0.0',
  models,
  checkedAt: now,
  settings: { enabled: true },
  ...extra,
})

export const providers = [
  snapshot(
    'claude',
    'Claude Code',
    [
      model('fable-5', 'Claude Fable 5', [levels]),
      model('opus-5', 'Claude Opus 5', [levels], true),
      model('sonnet-5', 'Claude Sonnet 5', [levels]),
      model('haiku-4.5', 'Claude Haiku 4.5', [{ id: 'thinking', label: 'Thinking', type: 'boolean', default: false }]),
    ],
    {
      version: '2.1.289',
      settings: { enabled: true, model: 'opus-5' },
      accounts: [
        { id: 'personal', name: 'Personal' },
        { id: 'studio', name: 'Studio' },
      ],
    },
  ),
  snapshot('codex', 'Codex', [
    model('gpt-5-codex', 'GPT-5 Codex', [effortOpt(['low', 'medium', 'high'], 'medium')], true),
    model('gpt-5-mini', 'GPT-5 Mini', [effortOpt(['low', 'medium', 'high'], 'low')]),
  ]),
  snapshot('opencode', 'OpenCode', [model('big-pickle', 'Big Pickle', [levels], true), model('mimo-2.6', 'Mimo V2.6 Flash', [])]),
  snapshot('antigravity', 'Antigravity', [model('gemini', 'Gemini 3 Pro', [effortOpt(['low', 'high'], 'high')], true)]),
]

export const projects = [
  { id: 'atlas', name: 'Atlas', path: 'C:/code/atlas', isGit: true, addedAt: now - 90 * 24 * HOUR, usedAt: now - 2 * MIN, order: 0 },
  { id: 'ledger', name: 'Ledger API', path: 'C:/code/ledger-api', isGit: true, addedAt: now - 70 * 24 * HOUR, usedAt: now - 18 * MIN, order: 1 },
  { id: 'harbor', name: 'Harbor', path: 'C:/code/harbor', isGit: true, addedAt: now - 40 * 24 * HOUR, usedAt: now - 5 * HOUR, order: 2 },
  { id: 'meridian', name: 'Meridian', path: 'C:/code/meridian', isGit: true, addedAt: now - 20 * 24 * HOUR, usedAt: now - 26 * HOUR, order: 3 },
]

let seqCounter = 0
const mk = (threadId, driver, modelId) => (kind, at, fields = {}) => ({
  kind,
  threadId,
  driver,
  model: modelId,
  seq: ++seqCounter,
  at,
  ...fields,
})

const toolPair = (e, at, id, name, input, output) => [
  e('tool.call', at, { tool: { id, name, status: 'in_progress', input } }),
  e('tool.result', at + 900, { tool: { id, name, status: 'completed', output } }),
]

export const THREADS = {
  dark: 'th-dark-mode',
  uuid: 'th-uuid-keys',
  csv: 'th-csv-export',
  skeleton: 'th-skeleton',
  flaky: 'th-flaky-test',
}

const task = (key, title, prompt, driver, modelId, branch, state, minutesAgo) => ({
  id: `task-${key}`,
  workspaceId: WORKSPACE,
  threadId: THREADS[key],
  title,
  prompt,
  driver,
  drivers: [driver],
  model: modelId,
  state,
  createdAt: now - minutesAgo * MIN,
  updatedAt: now - 20_000,
  worktree: { path: `C:/code/atlas-wt/${branch.split('/')[1]}`, branch, baseBranch: 'main', createdAt: now - minutesAgo * MIN },
})

export const tasks = [
  task('dark', 'Add a dark mode toggle', 'Add a dark mode toggle to the settings page. It should remember the choice across sessions.', 'claude', 'opus-5', 'agent/dark-mode', 'completed', 6),
  task('uuid', 'Migrate invoices to UUID keys', 'Migrate the invoices table from serial ids to UUIDs. Keep a rollback.', 'codex', 'gpt-5-codex', 'agent/uuid-keys', 'running', 5),
  task('csv', 'CSV export for reports', 'Add a CSV export to the reports page.', 'claude', 'opus-5', 'agent/csv-export', 'running', 5),
  task('skeleton', 'Skeleton loaders for charts', 'Show skeleton loaders while the dashboard charts load.', 'antigravity', 'gemini', 'agent/skeletons', 'running', 4),
  task('flaky', 'Fix the flaky date range test', 'The date range test fails about one run in ten. Find out why and fix it.', 'opencode', 'big-pickle', 'agent/flaky-test', 'completed', 8),
]

export const spawnResult = {
  workspace: { id: WORKSPACE, title: 'Atlas sprint', prompt: '', cwd: CWD, createdAt: now - 9 * MIN, updatedAt: now },
  tasks,
}

export function darkEvents() {
  const e = mk(THREADS.dark, 'claude', 'opus-5')
  const s = now - 6 * MIN
  return [
    e('user.message', s, { turnId: 'd1', text: tasks[0].prompt }),
    e('turn.started', s + 200, { turnId: 'd1' }),
    e('agent.thought', s + 1500, {
      turnId: 'd1',
      itemId: 'th1',
      text: 'The theme is probably set somewhere global. I should read how settings are laid out before touching anything, then keep the change small.',
    }),
    ...toolPair(e, s + 4000, 'c1', 'Grep', { pattern: 'theme', path: 'src' }, 'src/lib/theme.ts\nsrc/app/layout.tsx\nsrc/settings/Appearance.tsx'),
    ...toolPair(e, s + 6000, 'c2', 'Read', { file_path: 'src/settings/Appearance.tsx' }, 'export function Appearance() { ... }'),
    ...toolPair(e, s + 7000, 'c3', 'Read', { file_path: 'src/lib/theme.ts' }, 'export const themes = ["light", "dark"]'),
    e('agent.message', s + 12_000, {
      turnId: 'd1',
      itemId: 'm1',
      text: 'The theme list already exists in `lib/theme.ts`, but nothing stores the choice and Appearance has no control. I will add a small `useTheme` hook that persists to `localStorage`, then use it in the settings page.',
    }),
    ...toolPair(
      e,
      s + 20_000,
      'c4',
      'Write',
      {
        file_path: 'src/lib/useTheme.ts',
        content:
          "import { useEffect, useState } from 'react'\nimport { themes, type Theme } from './theme'\n\nconst KEY = 'atlas-theme'\n\nexport function useTheme() {\n  const [theme, setTheme] = useState<Theme>(() => {\n    const saved = localStorage.getItem(KEY)\n    return themes.includes(saved as Theme) ? (saved as Theme) : 'light'\n  })\n\n  useEffect(() => {\n    document.documentElement.dataset.theme = theme\n    localStorage.setItem(KEY, theme)\n  }, [theme])\n\n  return [theme, setTheme] as const\n}\n",
      },
      'Created src/lib/useTheme.ts',
    ),
    ...toolPair(
      e,
      s + 30_000,
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
    ...toolPair(
      e,
      s + 44_000,
      'c6',
      'Bash',
      { command: 'npm test -- theme' },
      ' PASS  src/lib/useTheme.test.ts\n  useTheme\n    ✓ defaults to light (4 ms)\n    ✓ restores the saved theme (2 ms)\n    ✓ writes the choice to localStorage (2 ms)\n\nTests: 3 passed, 3 total',
    ),
    e('agent.message', s + 52_000, {
      turnId: 'd1',
      itemId: 'm2',
      text: 'Dark mode is in. The toggle sits at the top of **Appearance** and the choice survives a reload.\n\n- `lib/useTheme.ts` reads and writes `atlas-theme`\n- `settings/Appearance.tsx` gets the switch\n- three new tests, all passing\n\nI have not touched the chart colors yet. They still use fixed values, so they will need a pass next.',
    }),
    e('usage', s + 53_000, { usage: { contextTokens: 61_000, contextWindow: 200_000 } }),
    e('turn.completed', s + 54_000, { turnId: 'd1' }),
  ]
}

export function uuidEvents() {
  const e = mk(THREADS.uuid, 'codex', 'gpt-5-codex')
  const s = now - 5 * MIN
  return [
    e('user.message', s, { turnId: 'u1', text: tasks[1].prompt }),
    e('turn.started', s + 100, { turnId: 'u1' }),
    e('plan', s + 2500, {
      plan: [
        { content: 'Inspect the invoices schema and its foreign keys', status: 'completed' },
        { content: 'Write the migration with a backfill', status: 'completed' },
        { content: 'Write the rollback', status: 'in_progress' },
        { content: 'Update the repository layer', status: 'pending' },
        { content: 'Run the migration against the dev database', status: 'pending' },
      ],
    }),
    ...toolPair(e, s + 4000, 'g1', 'Read', { file_path: 'prisma/schema.prisma' }, 'model Invoice { id Int @id @default(autoincrement()) ... }'),
    ...toolPair(e, s + 6000, 'g2', 'Grep', { pattern: 'invoice_id', path: 'src' }, 'src/repo/lines.ts\nsrc/repo/payments.ts\nsrc/repo/invoices.ts'),
    e('agent.message', s + 11_000, {
      turnId: 'u1',
      itemId: 'm1',
      text: 'Three tables reference `invoices.id`. I will add a `uuid` column, backfill it, move the foreign keys over, then swap the primary key in one transaction.',
    }),
    ...toolPair(
      e,
      s + 16_000,
      'g3',
      'Write',
      {
        file_path: 'prisma/migrations/20261005_invoices_uuid/migration.sql',
        content:
          'BEGIN;\n\nALTER TABLE invoices ADD COLUMN uuid uuid DEFAULT gen_random_uuid();\nUPDATE invoices SET uuid = gen_random_uuid() WHERE uuid IS NULL;\n\nALTER TABLE invoice_lines ADD COLUMN invoice_uuid uuid;\nUPDATE invoice_lines l SET invoice_uuid = i.uuid FROM invoices i WHERE l.invoice_id = i.id;\n\nCOMMIT;\n',
      },
      'Created migration.sql',
    ),
  ]
}

export function csvEvents() {
  const e = mk(THREADS.csv, 'claude', 'opus-5')
  const s = now - 5 * MIN
  return [
    e('user.message', s, { turnId: 'q1', text: tasks[2].prompt }),
    e('turn.started', s + 100, { turnId: 'q1' }),
    ...toolPair(e, s + 2500, 'r1', 'Read', { file_path: 'src/reports/ReportsTable.tsx' }, 'export function ReportsTable() { ... }'),
    e('agent.message', s + 6000, {
      turnId: 'q1',
      itemId: 'm1',
      text: 'The table already holds everything the export needs. One thing is unclear before I write it.',
    }),
    e('question.asked', s + 9000, {
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
}

export function skeletonEvents() {
  const e = mk(THREADS.skeleton, 'antigravity', 'gemini')
  const s = now - 4 * MIN
  return [
    e('user.message', s, { turnId: 's1', text: tasks[3].prompt }),
    e('turn.started', s + 100, { turnId: 's1' }),
    ...toolPair(e, s + 2000, 's1c', 'Glob', { pattern: 'src/charts/**/*.tsx' }, 'src/charts/Revenue.tsx\nsrc/charts/Signups.tsx\nsrc/charts/Churn.tsx'),
    e('agent.message', s + 6000, {
      turnId: 's1',
      itemId: 'm1',
      text: 'Each chart renders its own loading state, so I will add one shared `ChartSkeleton` and use it in all three.',
    }),
    ...toolPair(
      e,
      s + 9000,
      's1d',
      'Write',
      {
        file_path: 'src/charts/ChartSkeleton.tsx',
        content:
          "export function ChartSkeleton({ height = 220 }: { height?: number }) {\n  return <div className=\"skeleton\" style={{ height }} aria-busy=\"true\" />\n}\n",
      },
      'Created src/charts/ChartSkeleton.tsx',
    ),
    e('agent.thought', s + 13_000, { turnId: 's1', itemId: 'th', text: 'Checking how Signups handles its empty state before swapping the loader in.' }),
  ]
}

export function flakyEvents() {
  const e = mk(THREADS.flaky, 'opencode', 'big-pickle')
  const s = now - 8 * MIN
  return [
    e('user.message', s, { turnId: 'f1', text: tasks[4].prompt }),
    e('turn.started', s + 100, { turnId: 'f1' }),
    ...toolPair(e, s + 3000, 'f1a', 'Bash', { command: 'npm test -- dateRange --repeat 20' }, 'FAIL  2 of 20 runs\n  expected "Last 7 days" received "Last 8 days"'),
    ...toolPair(e, s + 9000, 'f1b', 'Read', { file_path: 'src/lib/dateRange.ts' }, 'const today = new Date()'),
    ...toolPair(
      e,
      s + 14_000,
      'f1c',
      'Edit',
      {
        file_path: 'src/lib/dateRange.test.ts',
        old_string: "it('labels the last week', () => {\n  expect(label(range(7))).toBe('Last 7 days')\n})",
        new_string: "it('labels the last week', () => {\n  vi.setSystemTime(new Date('2026-10-05T12:00:00Z'))\n  expect(label(range(7))).toBe('Last 7 days')\n})",
      },
      'Edited src/lib/dateRange.test.ts',
    ),
    e('agent.message', s + 20_000, {
      turnId: 'f1',
      itemId: 'm1',
      text: 'The test read the wall clock, so near midnight the range spanned eight days. It now pins the date, and 20 repeated runs all pass.',
    }),
    e('turn.completed', s + 22_000, { turnId: 'f1' }),
  ]
}

export const allEvents = () => {
  seqCounter = 0
  return [darkEvents(), uuidEvents(), csvEvents(), skeletonEvents(), flakyEvents()]
}

const limit = (window, used, hours) => ({ window, status: 'allowed', usedPercent: used, resetsAt: Math.floor((now + hours * HOUR) / 1000) })

export const usage = {
  startedAt: now - 3 * HOUR,
  totals: { driver: 'all', inputTokens: 912_400, outputTokens: 188_200, cacheReadTokens: 4_410_000, cacheWriteTokens: 320_000, costUsd: 18.42, turns: 64, sessions: 9 },
  drivers: [
    {
      driver: 'claude',
      account: 'personal',
      accountName: 'Personal',
      inputTokens: 612_000,
      outputTokens: 121_000,
      cacheReadTokens: 3_100_000,
      cacheWriteTokens: 210_000,
      costUsd: 11.8,
      turns: 38,
      sessions: 5,
      lastActiveAt: now - 40_000,
      limitsFetchedAt: now - 20_000,
      limits: [limit('five_hour', 38, 3.2), limit('seven_day', 21, 96), limit('seven_day_opus', 14, 96)],
    },
    {
      driver: 'codex',
      inputTokens: 210_000,
      outputTokens: 44_000,
      cacheReadTokens: 900_000,
      cacheWriteTokens: 0,
      costUsd: 4.1,
      turns: 17,
      sessions: 2,
      lastActiveAt: now - 90_000,
      limitsFetchedAt: now - 20_000,
      limits: [limit('five_hour', 12, 4.1), limit('seven_day', 27, 120)],
    },
    {
      driver: 'antigravity',
      inputTokens: 90_400,
      outputTokens: 23_200,
      cacheReadTokens: 410_000,
      cacheWriteTokens: 0,
      costUsd: 2.52,
      turns: 9,
      sessions: 2,
      lastActiveAt: now - 3 * MIN,
      limitsFetchedAt: now - 20_000,
      limits: [limit('five_hour', 8, 4.5)],
    },
  ],
}

export const worktrees = [
  {
    title: 'Project',
    path: 'C:/code/atlas',
    branch: 'main',
    isMain: true,
    orphaned: false,
    files: [],
    commits: [
      { sha: 'a91f3c2d', short: 'a91f3c2', subject: 'Release 2.4.0', author: 'Mara', at: now - 2 * HOUR, onBase: true },
      { sha: 'c4e8b71a', short: 'c4e8b71', subject: 'Tighten chart tooltips', author: 'Mara', at: now - 9 * HOUR, onBase: true },
      { sha: '7d20e5f0', short: '7d20e5f', subject: 'Add date range presets', author: 'Jonas', at: now - 30 * HOUR, onBase: true },
    ],
    ahead: 0,
    upstream: 'origin/main',
    unpushed: 0,
    unpulled: 0,
  },
  {
    threadId: THREADS.dark,
    title: 'Add a dark mode toggle',
    path: 'C:/code/atlas-wt/dark-mode',
    branch: 'agent/dark-mode',
    base: 'main',
    isMain: false,
    orphaned: false,
    files: [
      { path: 'src/lib/useTheme.ts', status: 'added', staged: false, insertions: 18, deletions: 0, binary: false },
      { path: 'src/settings/Appearance.tsx', status: 'modified', staged: false, insertions: 6, deletions: 1, binary: false },
      { path: 'src/lib/useTheme.test.ts', status: 'added', staged: true, insertions: 31, deletions: 0, binary: false },
    ],
    commits: [{ sha: 'e1b22f90', short: 'e1b22f9', subject: 'Add theme hook', author: 'Agent', at: now - 4 * MIN, onBase: false }],
    ahead: 1,
    unpushed: 1,
    unpulled: 0,
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

const themeLines = [
  "import { useEffect, useState } from 'react'",
  "import { themes, type Theme } from './theme'",
  '',
  "const KEY = 'atlas-theme'",
  '',
  'export function useTheme() {',
  '  const [theme, setTheme] = useState<Theme>(() => {',
  '    const saved = localStorage.getItem(KEY)',
  "    return themes.includes(saved as Theme) ? (saved as Theme) : 'light'",
  '  })',
  '',
  '  useEffect(() => {',
  '    document.documentElement.dataset.theme = theme',
  '    localStorage.setItem(KEY, theme)',
  '  }, [theme])',
  '',
  '  return [theme, setTheme] as const',
  '}',
]

export const diffNew = {
  path: 'src/lib/useTheme.ts',
  insertions: themeLines.length,
  deletions: 0,
  binary: false,
  truncated: false,
  hunks: [
    {
      header: `@@ -0,0 +1,${themeLines.length} @@`,
      lines: themeLines.map((content, i) => ({ kind: 'added', new: i + 1, content })),
    },
  ],
}

export function coordinatorEvents() {
  const e = (kind, at, fields = {}) => ({ kind, threadId: 'coordinator', seq: 0, at, driver: 'claude', model: 'opus-5', ...fields })
  const plan = {
    tasks: [
      { title: 'CSV export for reports', prompt: 'Add a CSV export to the reports page. Respect the active filters.' },
      { title: 'Skeleton loaders for charts', prompt: 'Show skeleton loaders while the dashboard charts load.' },
      { title: 'Fix the flaky date range test', prompt: 'The date range test fails about one run in ten. Find out why and fix it.' },
    ],
  }
  const text =
    'These three touch different files, so they can run side by side. I will give each its own worktree so nothing collides.\n\n```composer:tasks\n' +
    JSON.stringify(plan) +
    '\n```\n\nSay the word and I will start them.'
  const list = [
    e('user.message', now - 40_000, { turnId: 'c1', text: 'Ship the Atlas reports upgrade: CSV export, skeleton loaders on the charts, and fix that flaky date test.' }),
    e('turn.started', now - 39_000, { turnId: 'c1' }),
    e('agent.message', now - 36_000, { turnId: 'c1', itemId: 'cm1', text }),
    e('turn.completed', now - 35_000, { turnId: 'c1' }),
  ]
  return list.map((x, i) => ({ ...x, seq: i + 1 }))
}

export const history = [
  { id: 'h1', title: 'Atlas sprint', updatedAt: now - 20_000 },
]
