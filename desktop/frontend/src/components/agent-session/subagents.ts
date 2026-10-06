import { RuntimeEvent } from './eventReducer';
import { AgentStreamBlock, SubagentBlockData, SubagentEntry } from './types';

const SPAWN_TOOLS = new Set(['task', 'agent']);
const TARGET_KEYS = ['file_path', 'command', 'pattern', 'path', 'url', 'query', 'description', 'prompt'];

export function isSubagentEvent(event: RuntimeEvent): boolean {
  return event.kind.startsWith('subagent.');
}

export function isSubagentBlock(block: AgentStreamBlock): block is SubagentBlockData {
  return block.type === 'subagent';
}

function targetOf(input: Record<string, unknown> | undefined): string {
  if (!input) return '';
  for (const key of TARGET_KEYS) {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function blankAgent(toolId: string, at?: number): SubagentBlockData {
  return { type: 'subagent', id: `subagent-${toolId}`, toolId, title: 'Subagent', status: 'running', startedAt: at, entries: [] };
}

function replaceAgent(blocks: AgentStreamBlock[], index: number, next: SubagentBlockData): AgentStreamBlock[] {
  const out = blocks.slice();
  out[index] = next;
  return out;
}

function insertAgent(blocks: AgentStreamBlock[], agent: SubagentBlockData): AgentStreamBlock[] {
  let at = 0;
  while (at < blocks.length && blocks[at].type === 'subagent') at++;
  return [...blocks.slice(0, at), agent, ...blocks.slice(at)];
}

function update(
  blocks: AgentStreamBlock[],
  toolId: string,
  at: number | undefined,
  change: (agent: SubagentBlockData) => SubagentBlockData,
): AgentStreamBlock[] {
  const id = `subagent-${toolId}`;
  const index = blocks.findIndex((block) => block.id === id && block.type === 'subagent');
  if (index < 0) return insertAgent(blocks, change(blankAgent(toolId, at)));
  return replaceAgent(blocks, index, change(blocks[index] as SubagentBlockData));
}

function setEntry(entries: SubagentEntry[], entry: SubagentEntry): SubagentEntry[] {
  const index = entries.findIndex((existing) => existing.id === entry.id);
  if (index < 0) return [...entries, entry];
  const out = entries.slice();
  out[index] = entry;
  return out;
}

export function trackSubagents(blocks: AgentStreamBlock[], event: RuntimeEvent): AgentStreamBlock[] {
  const tool = event.tool;
  switch (event.kind) {
    case 'tool.call': {
      if (!tool || !SPAWN_TOOLS.has(tool.name.toLowerCase())) return blocks;
      const input = (tool.input ?? {}) as Record<string, unknown>;
      return update(blocks, tool.id, event.at, (agent) => ({
        ...agent,
        title: String(input.description || input.subagent_type || agent.title),
        agentType: typeof input.subagent_type === 'string' ? input.subagent_type : agent.agentType,
        prompt: typeof input.prompt === 'string' ? input.prompt : agent.prompt,
        startedAt: agent.startedAt ?? event.at,
      }));
    }
    case 'tool.result': {
      if (!tool) return blocks;
      const id = `subagent-${tool.id}`;
      if (!blocks.some((block) => block.id === id && block.type === 'subagent')) return blocks;
      return update(blocks, tool.id, event.at, (agent) => ({
        ...agent,
        status: tool.status === 'failed' ? 'error' : 'completed',
        endedAt: event.at,
        result: tool.output || agent.result,
      }));
    }
    case 'subagent.message': {
      const parent = event.parentToolId;
      if (!parent || !event.text) return blocks;
      return update(blocks, parent, event.at, (agent) => ({
        ...agent,
        entries: setEntry(agent.entries, { id: `t-${event.itemId || event.seq}`, kind: 'text', text: event.text ?? '', at: event.at }),
      }));
    }
    case 'subagent.tool.call': {
      const parent = event.parentToolId;
      if (!parent || !tool) return blocks;
      return update(blocks, parent, event.at, (agent) => ({
        ...agent,
        entries: setEntry(agent.entries, {
          id: `u-${tool.id}`,
          kind: 'tool',
          name: tool.name,
          target: targetOf(tool.input as Record<string, unknown> | undefined),
          status: 'running',
          at: event.at,
        }),
      }));
    }
    case 'subagent.tool.result': {
      const parent = event.parentToolId;
      if (!parent || !tool) return blocks;
      return update(blocks, parent, event.at, (agent) => ({
        ...agent,
        entries: agent.entries.map((entry) =>
          entry.kind === 'tool' && entry.id === `u-${tool.id}`
            ? { ...entry, status: tool.status === 'failed' ? 'error' : 'completed', output: tool.output }
            : entry,
        ),
      }));
    }
    case 'turn.failed':
    case 'turn.completed': {
      const stopped = event.kind === 'turn.failed' || event.stopReason === 'cancelled';
      if (!stopped || !blocks.some((block) => block.type === 'subagent' && block.status === 'running')) return blocks;
      return blocks.map((block) =>
        block.type === 'subagent' && block.status === 'running'
          ? { ...block, status: 'stopped', endedAt: event.at }
          : block,
      );
    }
    default:
      return blocks;
  }
}
