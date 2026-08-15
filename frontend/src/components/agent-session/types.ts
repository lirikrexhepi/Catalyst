import { DiffLine } from './EditTool';
import { TodoItem } from './TodoTool';
import { QuestionOption } from './QuestionTool';
import { ToolGroupItem } from './ToolGroup';

/**
 * Standard Agent Streaming Event & Message Types
 * Compatible with Claude Code CLI, Antigravity Agent loops, AI SDK, and MCP tools.
 */

export interface UserMessageBlock {
  type: 'user';
  id: string;
  content: string;
  timestamp?: number;
}

/** Inline rule marking a provider/model switch mid-conversation. */
export interface NoticeBlock {
  type: 'notice';
  id: string;
  label: string;
  icon?: string;
}

export interface AssistantTextBlock {
  type: 'text';
  id: string;
  content: string;
  isStreaming?: boolean;
}

export interface ThinkingBlockData {
  type: 'thinking';
  id: string;
  isThinking: boolean;
  thoughtText: string;
  durationSeconds?: number;
}

export interface ToolGroupBlockData {
  type: 'tool_group';
  id: string;
  title: string;
  summary?: string;
  items: ToolGroupItem[];
  /** Tool call ids folded into this group, so results can find their row. */
  memberIds?: string[];
}

export interface BashToolBlockData {
  type: 'tool_bash';
  id: string;
  command: string;
  output?: string;
  summary?: string;
  status?: 'running' | 'completed' | 'error';
  exitCode?: number;
}

export interface SearchToolBlockData {
  type: 'tool_search';
  id: string;
  files: string[];
  query?: string;
  summary?: string;
  isSearching?: boolean;
}

export interface EditToolBlockData {
  type: 'tool_edit';
  id: string;
  filePath: string;
  additions?: number;
  deletions?: number;
  diffLines?: DiffLine[];
}

export interface TodoToolBlockData {
  type: 'tool_todo';
  id: string;
  title?: string;
  todos: TodoItem[];
}

export interface PlanToolBlockData {
  type: 'tool_plan';
  id: string;
  planFile?: string;
  title: string;
  summary: string;
  approved?: boolean;
}

export interface QuestionToolBlockData {
  type: 'tool_question';
  id: string;
  questionNumber?: number;
  totalQuestions?: number;
  question: string;
  options: QuestionOption[];
}

export type AgentStreamBlock =
  | UserMessageBlock
  | NoticeBlock
  | AssistantTextBlock
  | ThinkingBlockData
  | ToolGroupBlockData
  | BashToolBlockData
  | SearchToolBlockData
  | EditToolBlockData
  | TodoToolBlockData
  | PlanToolBlockData
  | QuestionToolBlockData;
