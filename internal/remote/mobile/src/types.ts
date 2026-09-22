export type TaskState = 'pending' | 'running' | 'complete' | 'failed' | 'closed'

export interface FileRef {
  path: string
  mime?: string
}

export interface FileDiff {
  path: string
  oldText?: string
  newText?: string
}

export interface ToolCall {
  id: string
  name: string
  kind?: string
  status: string
  input?: Record<string, unknown>
  output?: string
  diffs?: FileDiff[]
}

export interface PlanEntry {
  content: string
  status: string
  priority?: string
}

export interface ApprovalOption {
  id: string
  name: string
  kind: string
}

export interface ApprovalRequest {
  requestId: string
  title: string
  detail?: string
  options?: ApprovalOption[]
}

export interface QuestionRequest {
  requestId: string
  questions: Array<{
    question: string
    options?: string[]
    isMultiSelect?: boolean
  }>
}

export interface RuntimeEvent {
  kind: string
  threadId: string
  turnId?: string
  instanceId?: string
  driver?: string
  seq: number
  itemId?: string
  at: number
  text?: string
  delta?: boolean
  icon?: string
  files?: FileRef[]
  tool?: ToolCall
  plan?: PlanEntry[]
  approval?: ApprovalRequest
  question?: QuestionRequest
  stopReason?: string
  error?: string
  rateLimits?: Array<{ window: string; status?: string; usedPercent?: number; resetsAt?: number }>
}

export interface ServerMessage {
  type: 'event' | 'events' | 'agents' | 'status' | 'pong' | 'error'
  event?: RuntimeEvent
  events?: RuntimeEvent[]
  error?: string
}

export type ModelOptions = Record<string, unknown>

export interface ThreadSummary {
  threadId: string
  title: string
  kind: 'coordinator' | 'agent'
  driver: string
  model: string
  options?: ModelOptions
  state?: TaskState
  cwd?: string
  projectCwd?: string
  projectName?: string
  branch?: string
  live: boolean
  busy: boolean
  turnStartedAt?: number
  lastTurnMs?: number
  lastActivity?: number
  preview?: string
  attention?: 'approval' | 'question' | ''
}

export interface OptionChoice {
  id: string
  label: string
  default?: boolean
}

export interface OptionDescriptor {
  id: string
  label: string
  type: 'select' | 'boolean'
  choices?: OptionChoice[]
  default?: unknown
}

export interface ModelInfo {
  id: string
  name: string
  default?: boolean
  options?: OptionDescriptor[]
}

export interface ProviderInfo {
  driver: string
  name: string
  models: ModelInfo[]
}

export interface ModelChoice {
  driver: string
  model: string
  options?: ModelOptions
}

export interface Project {
  id?: string
  path: string
  name: string
  totalAgents: number
  runningAgents: number
  lastActivity: number
}
