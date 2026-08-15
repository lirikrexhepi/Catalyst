import { domain } from '../../../wailsjs/go/models';
import { AgentStreamBlock } from './types';
import { ToolGroupItem } from './ToolGroup';

export type RuntimeEvent = domain.RuntimeEvent;

const TEXT_TOOLS = new Set(['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'view_file', 'list_dir', 'grep_search', 'find_by_name', 'read_url_content']);
const BASH_TOOLS = new Set(['Bash', 'PowerShell', 'run_command', 'commandExecution']);
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'replace_file_content', 'write_to_file', 'multi_replace_file_content', 'fileChange']);
const SEARCH_TOOLS = new Set(['Glob', 'Grep', 'grep_search', 'find_by_name']);
const TODO_TOOLS = new Set(['TodoWrite', 'manage_task']);

/**
 * Folds one runtime event into the block list.
 *
 * Streaming text arrives as many small deltas, so consecutive text/thinking
 * events are merged into the trailing block rather than appended, which keeps
 * the list short and lets React reconcile a single node per message.
 */
export function reduceEvent(blocks: AgentStreamBlock[], event: RuntimeEvent): AgentStreamBlock[] {
  switch (event.kind) {
    case 'agent.message':
      return appendText(blocks, event, 'text');
    case 'agent.thought':
      return appendText(blocks, event, 'thinking');
    case 'tool.call':
    case 'tool.result':
      return upsertTool(closeStreaming(blocks), event);
    case 'plan':
      return upsertPlan(blocks, event);
    case 'turn.started':
      // No placeholder block: the surrounding panel renders the waiting
      // indicator, so emitting one here would show two spinners at once.
      return blocks;
    case 'turn.completed':
    case 'turn.failed':
      return settle(blocks, event);
    default:
      return blocks;
  }
}

export function userBlock(text: string, id: string): AgentStreamBlock {
  return { type: 'user', id, content: text, timestamp: Date.now() };
}

function appendText(
  blocks: AgentStreamBlock[],
  event: RuntimeEvent,
  kind: 'text' | 'thinking',
): AgentStreamBlock[] {
  const text = event.text ?? '';
  if (!text) return blocks;

  const last = blocks[blocks.length - 1];

  if (kind === 'text' && last?.type === 'text') {
    const merged: AgentStreamBlock = {
      ...last,
      content: event.delta ? last.content + text : text,
      isStreaming: true,
    };
    return [...blocks.slice(0, -1), merged];
  }

  if (kind === 'thinking' && last?.type === 'thinking' && last.isThinking) {
    const merged: AgentStreamBlock = {
      ...last,
      thoughtText: event.delta ? last.thoughtText + text : text,
    };
    return [...blocks.slice(0, -1), merged];
  }

  const id = `${kind}-${event.seq}`;
  return [
    ...blocks,
    kind === 'text'
      ? { type: 'text', id, content: text, isStreaming: true }
      : { type: 'thinking', id, isThinking: true, thoughtText: text },
  ];
}

function upsertTool(blocks: AgentStreamBlock[], event: RuntimeEvent): AgentStreamBlock[] {
  const tool = event.tool;
  if (!tool) return blocks;

  const id = `tool-${tool.id}`;
  const index = blocks.findIndex(
    (candidate) =>
      candidate.id === id ||
      (candidate.type === 'tool_group' && candidate.memberIds?.includes(tool.id)),
  );

  // A result event carries only id/status/output — the tool name and its input
  // arrived with the earlier call — so it is merged into the existing block
  // rather than rebuilt, which would drop the command being displayed.
  if (index >= 0) {
    const merged = [...blocks];
    merged[index] = mergeToolBlock(blocks[index], tool);
    return merged;
  }

  // Git commands and consecutive read/bash/search activities collapse into
  // a clean tool group so repetitive commands don't bury the feed.
  const name = tool.name || tool.kind || 'tool';
  const input = asRecord(tool.input);
  const cmd = str(input.command);
  const isGit = isGitCommand(name, cmd);

  const last = blocks[blocks.length - 1];
  if (last?.type === 'tool_group') {
    const items = [...last.items, toGroupItem(name, tool, input)];
    const next: AgentStreamBlock = {
      ...last,
      title: groupTitle(items),
      items,
      summary: groupSummary(items),
      memberIds: [...(last.memberIds ?? []), tool.id],
    };
    return [...blocks.slice(0, -1), next];
  }

  // If the preceding block was a standalone bash command and another command/git runs,
  // coalesce them into a unified tool group.
  if (last?.type === 'tool_bash' && (BASH_TOOLS.has(name) || isGit)) {
    const prevItem: ToolGroupItem = {
      type: isGitCommand('bash', last.command) ? 'git' : 'bash',
      action: isGitCommand('bash', last.command) ? 'Git' : 'Ran',
      target: last.command,
    };
    const newItem = toGroupItem(name, tool, input);
    const items = [prevItem, newItem];
    const group: AgentStreamBlock = {
      type: 'tool_group',
      id: `group-${Date.now()}`,
      title: groupTitle(items),
      summary: groupSummary(items),
      items,
      memberIds: [tool.id],
    };
    return [...blocks.slice(0, -1), group];
  }

  const block = toToolBlock(tool);
  return block ? [...blocks, block] : blocks;
}

function isGitCommand(name: string, cmd?: string): boolean {
  if (name.toLowerCase() === 'git') return true;
  if (!cmd) return false;
  return /^\s*git(\.exe)?(\s+|$)/i.test(cmd);
}

function isInspectionCommand(cmd?: string): boolean {
  if (!cmd) return false;
  return /^\s*(get|cat|type|head|tail|curl|fetch|dir|ls|find|grep|rg)(\.exe)?(\s+|$)/i.test(cmd);
}

// Names the group after the tool used when it is homogeneous, and generically
// once it mixes, so the header stays informative either way.
function groupTitle(items: ToolGroupItem[]): string {
  if (items.length === 0) return 'Tools';
  if (items.every((item) => item.type === 'git')) return 'Git';
  if (items.every((item) => item.type === 'read')) return items[0]?.action ?? 'Read';
  if (items.every((item) => item.type === 'bash')) return 'Commands';
  const first = items[0]?.action ?? 'Tools';
  return items.every((item) => item.action === first) ? first : 'Working';
}

function groupSummary(items: ToolGroupItem[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0].target || '1 call';
  const count = `${items.length} ${items.every((i) => i.type === 'git' || i.type === 'bash') ? 'commands' : 'calls'}`;
  return count;
}

function mergeToolBlock(existing: AgentStreamBlock, tool: domain.ToolCall): AgentStreamBlock {
  const status = toStatus(tool.status);

  switch (existing.type) {
    case 'tool_bash':
      return {
        ...existing,
        status,
        output: tool.output || existing.output,
        exitCode: existing.exitCode,
      };
    case 'tool_search':
      return {
        ...existing,
        files: tool.output ? toFileList(tool.output) : existing.files,
        isSearching: status === 'running',
      };
    case 'tool_edit': {
      const diff = tool.diffs?.[0];
      return diff
        ? {
            ...existing,
            filePath: diff.path || existing.filePath,
            additions: countLines(diff.newText) ?? existing.additions,
            deletions: countLines(diff.oldText) ?? existing.deletions,
          }
        : existing;
    }
    case 'tool_group':
      // A multi-call group is labelled by its count; only a single-call card
      // borrows the tool's own output as its summary.
      return existing.items.length > 1
        ? existing
        : { ...existing, summary: summarize(tool) ?? existing.summary };
    default:
      return existing;
  }
}

function toToolBlock(tool: domain.ToolCall): AgentStreamBlock | null {
  const id = `tool-${tool.id}`;
  const name = tool.name || tool.kind || 'tool';
  const input = (tool.input ?? {}) as Record<string, unknown>;
  const cmd = str(input.command);

  // Group standalone git commands immediately into a clean Git tool group
  if (isGitCommand(name, cmd)) {
    const item = toGroupItem(name, tool, input);
    return {
      type: 'tool_group',
      id,
      title: 'Git',
      summary: cmd || 'git',
      items: [item],
      memberIds: [tool.id],
    };
  }

  if (BASH_TOOLS.has(name) || tool.kind === 'commandExecution') {
    return {
      type: 'tool_bash',
      id,
      command: cmd || name,
      output: tool.output,
      status: toStatus(tool.status),
    };
  }

  if (EDIT_TOOLS.has(name) || tool.kind === 'fileChange') {
    const diff = tool.diffs?.[0];
    return {
      type: 'tool_edit',
      id,
      filePath: diff?.path || str(input.file_path) || str(input.FilePath) || name,
      additions: countLines(diff?.newText),
      deletions: countLines(diff?.oldText),
    };
  }

  if (SEARCH_TOOLS.has(name)) {
    return {
      type: 'tool_search',
      id,
      files: toFileList(tool.output),
      query: str(input.pattern) || str(input.Query) || str(input.query),
      isSearching: tool.status === 'in_progress' || tool.status === 'pending',
    };
  }

  if (TODO_TOOLS.has(name)) {
    return { type: 'tool_todo', id, todos: toTodos(input) };
  }

  return {
    type: 'tool_group',
    id,
    title: name,
    summary: summarize(tool),
    items: [toGroupItem(name, tool, input)],
    memberIds: [tool.id],
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return (value ?? {}) as Record<string, unknown>;
}

function toGroupItem(
  name: string,
  tool: domain.ToolCall,
  input: Record<string, unknown>,
): ToolGroupItem {
  const cmd = str(input.command);
  const target =
    str(input.file_path) || str(input.path) || str(input.pattern) || cmd || '';
  const isGit = isGitCommand(name, cmd);
  const isInspect = isInspectionCommand(cmd);

  const type: ToolGroupItem['type'] = isGit
    ? 'git'
    : TEXT_TOOLS.has(name) || isInspect
    ? 'read'
    : 'bash';

  const action = isGit
    ? 'Git'
    : TEXT_TOOLS.has(name)
    ? name
    : isInspect
    ? 'Inspect'
    : 'Ran';

  return { type, action, target: target || (tool.output ? '' : name) };
}

function upsertPlan(blocks: AgentStreamBlock[], event: RuntimeEvent): AgentStreamBlock[] {
  const entries = event.plan ?? [];
  if (entries.length === 0) return blocks;

  const id = `plan-${event.turnId || event.seq}`;
  const block: AgentStreamBlock = {
    type: 'tool_todo',
    id,
    title: 'Plan',
    todos: entries.map((entry, index) => ({
      id: `${id}-${index}`,
      text: entry.content,
      status: toTodoStatus(entry.status),
    })),
  };

  const index = blocks.findIndex((candidate) => candidate.id === id);
  if (index === -1) return [...blocks, block];
  const merged = [...blocks];
  merged[index] = block;
  return merged;
}

function closeStreaming(blocks: AgentStreamBlock[]): AgentStreamBlock[] {
  const last = blocks[blocks.length - 1];
  if (last?.type !== 'text' || !last.isStreaming) return blocks;
  return [...blocks.slice(0, -1), { ...last, isStreaming: false }];
}

// Closes out any streaming indicators so the feed does not keep pulsing after
// the turn ends.
function settle(blocks: AgentStreamBlock[], event: RuntimeEvent): AgentStreamBlock[] {
  const cleaned = blocks.map((block) => {
    if (block.type === 'text' && block.isStreaming) return { ...block, isStreaming: false };
    if (block.type === 'thinking' && block.isThinking) return { ...block, isThinking: false };
    return block;
  });

  if (event.kind === 'turn.failed' && event.error) {
    return [...cleaned, { type: 'text', id: `error-${event.seq}`, content: `⚠ ${event.error}` }];
  }
  return cleaned;
}

function toStatus(status: string): 'running' | 'completed' | 'error' {
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'error';
  return 'running';
}

function toTodoStatus(status: string): 'pending' | 'in_progress' | 'completed' {
  if (status === 'completed' || status === 'DONE') return 'completed';
  if (status === 'in_progress' || status === 'ACTIVE') return 'in_progress';
  return 'pending';
}

function toTodos(input: Record<string, unknown>) {
  const raw = Array.isArray(input.todos) ? input.todos : [];
  return raw.map((entry, index) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    return {
      id: `todo-${index}`,
      text: str(item.content) || str(item.text),
      status: toTodoStatus(str(item.status)),
    };
  });
}

function toFileList(output?: string): string[] {
  if (!output) return [];
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function summarize(tool: domain.ToolCall): string | undefined {
  if (!tool.output) return undefined;
  const firstLine = tool.output.split('\n')[0]?.trim();
  return firstLine && firstLine.length <= 120 ? firstLine : undefined;
}

function countLines(text?: string): number | undefined {
  if (!text) return undefined;
  return text.split('\n').length;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
