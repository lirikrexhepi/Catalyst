const effort = (ids: string[], def: string) => ({
  id: 'effort',
  label: 'Reasoning',
  type: 'select',
  default: def,
  choices: ids.map((id) => ({ id, label: id === 'xhigh' ? 'Extra High' : id.charAt(0).toUpperCase() + id.slice(1), default: id === def })),
})

const levels = effort(['low', 'medium', 'high', 'xhigh', 'max'], 'high')

const providers = [
  {
    driver: 'opencode',
    name: 'OpenCode',
    models: [
      { id: 'big-pickle', name: 'Big Pickle', options: [levels] },
      { id: 'ling-3', name: 'Ling 3.0 Flash Fin', options: [levels] },
      { id: 'mimo-2.6', name: 'Mimo V2.6 Flash' },
      {
        id: 'muse-1.2',
        name: 'Muse Spark 1.2 Contributor',
        options: [levels, { id: 'thinking', label: 'Thinking', type: 'boolean', default: false }, { id: 'fast', label: 'Fast Mode', type: 'boolean', default: false }],
      },
      { id: 'muse-1.3', name: 'Muse Spark 1.3 Contributor', options: [effort(['low', 'medium', 'high', 'xhigh'], 'medium')] },
      { id: 'neomotron-3', name: 'Neomotron 3 Ultra', options: [levels] },
    ],
  },
  {
    driver: 'claude',
    name: 'Claude Code',
    models: Array.from({ length: 9 }, (_, i) => ({ id: `claude-${i}`, name: `Claude Model With A Long Name ${i + 1}`, options: [levels] })),
  },
  { driver: 'antigravity', name: 'Antigravity', models: [{ id: 'gemini', name: 'Gemini 3 Pro', options: [effort(['low', 'high'], 'high')] }] },
]

localStorage.setItem('orchestrator_providers_cache', JSON.stringify(providers))
localStorage.setItem(
  'orchestrator_new_agent',
  JSON.stringify({ cwd: '', autoApprove: true, choice: { driver: 'opencode', model: 'muse-1.2', options: { effort: 'xhigh' } } }),
)
