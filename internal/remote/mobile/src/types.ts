export type TaskState = 'pending' | 'running' | 'complete' | 'failed' | 'closed'

export interface RemoteAgentView {
  threadId: string
  title: string
  driver: string
  model: string
  state: TaskState
  cwd: string
  branch?: string
  live: boolean
}

export interface RemoteStatus {
  project: string
  activeModel: string
  activeDriver: string
  totalAgents: number
  runningAgents: number
}

export interface RuntimeEvent {
  kind: string
  threadId: string
  turnId?: string
  instanceId?: string
  driver?: string
  seq: number
  at: number
  text?: string
  delta?: boolean
  icon?: string
  tool?: ToolCall
  plan?: PlanEntry[]
  approval?: ApprovalRequest
  question?: QuestionRequest
  stopReason?: string
  error?: string
}

export interface ToolCall {
  id: string
  name: string
  kind?: string
  status: string
  input?: Record<string, unknown>
  output?: string
}

export interface PlanEntry {
  content: string
  status: string
  priority?: string
}

export interface ApprovalRequest {
  requestId: string
  title: string
  detail?: string
  options?: Array<{ id: string; name: string; kind: string }>
}

export interface QuestionRequest {
  requestId: string
  questions: Array<{
    question: string
    options?: string[]
    isMultiSelect?: boolean
  }>
}

export interface ServerMessage {
  type: 'event' | 'agents' | 'status' | 'pong' | 'error'
  event?: RuntimeEvent
  agents?: RemoteAgentView[]
  status?: RemoteStatus
  error?: string
}

export type Screen =
  | { id: 'auth' }
  | { id: 'projects' }
  | { id: 'coordinator'; projectPath?: string; projectName?: string }
  | { id: 'agents'; projectPath: string; projectName: string }
  | { id: 'agent-chat'; threadId: string; title: string; cwd: string }

export interface Project {
  path: string
  name: string
  agents: RemoteAgentView[]
  runningCount: number
  lastActivity: number
}
