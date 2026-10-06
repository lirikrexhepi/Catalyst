/**
 * Natural language intent parser for detecting when the user wants to spawn
 * a new agent thread rather than messaging the currently focused agent.
 */

export interface SpawnIntentResult {
  isSpawn: boolean;
  cleanPrompt: string;
  suggestedTitle: string;
}

const VERB_NORMALIZATIONS: Record<string, string> = {
  says: 'Say',
  saying: 'Say',
  tells: 'Tell',
  telling: 'Tell',
  greets: 'Greet',
  greeting: 'Greet',
  checks: 'Check',
  checking: 'Check',
  fixes: 'Fix',
  fixing: 'Fix',
  builds: 'Build',
  building: 'Build',
  writes: 'Write',
  writing: 'Write',
  creates: 'Create',
  creating: 'Create',
  updates: 'Update',
  updating: 'Update',
  tests: 'Test',
  testing: 'Test',
  reviews: 'Review',
  reviewing: 'Review',
  inspects: 'Inspect',
  inspecting: 'Inspect',
  helps: 'Help',
  helping: 'Help',
  runs: 'Run',
  running: 'Run',
  makes: 'Make',
  making: 'Make',
  generates: 'Generate',
  generating: 'Generate',
  designs: 'Design',
  designing: 'Design',
};

function normalizeActionPrompt(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const words = trimmed.split(/\s+/);
  const firstLower = words[0]?.toLowerCase();

  if (firstLower && VERB_NORMALIZATIONS[firstLower]) {
    words[0] = VERB_NORMALIZATIONS[firstLower];
    return words.join(' ');
  }

  // Capitalize first character
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Returns true if the text matches explicit shortcuts or natural language
 * patterns indicating the user wants to spawn a new agent.
 */
export function isSpawnIntent(rawText: string): boolean {
  const text = rawText.trim();
  if (!text) return false;

  // 1. Explicit shortcut prefixes: @new, @spawn, @agent
  if (/^@(new|spawn|agent)\b/i.test(text)) {
    return true;
  }

  // 2. Natural language spawn phrases:
  // e.g. "launch a new agent that says hello to me"
  //      "spawn an agent to build the navbar"
  //      "create an agent that checks the build"
  //      "start a new agent for the api"
  const nlRegex =
    /^(?:please\s+|can\s+you\s+|also\s+)?(?:launch|spawn|create|start|open|run|spin\s+up|dispatch|add)\s+(?:an?\s+)?(?:new\s+|another\s+|separate\s+)?agent(?:\s+(?:that|to|for|who|which)\s+|\s*[:,-]\s*|\s+)/i;
  if (nlRegex.test(text)) {
    return true;
  }

  // 3. Direct "new agent" prefix: e.g. "new agent: ...", "new agent to ...", "new agent that ..."
  const directRegex =
    /^(?:new\s+agent|another\s+agent)(?:\s*[:,-]\s*|\s+(?:to|that|for)\s+|\s+)/i;
  if (directRegex.test(text)) {
    return true;
  }

  return false;
}

/**
 * Parses user input to determine if it should spawn a new agent.
 * Extracts the clean task instructions and a concise suggested title.
 */
export function parseSpawnIntent(rawText: string, hasActiveAgent: boolean): SpawnIntentResult {
  const text = rawText.trim();
  if (!text) {
    return { isSpawn: false, cleanPrompt: '', suggestedTitle: '' };
  }

  // If there are 0 active agents, every prompt spawns a new agent
  if (!hasActiveAgent) {
    return {
      isSpawn: true,
      cleanPrompt: text,
      suggestedTitle: text.length > 28 ? `${text.slice(0, 28)}…` : text,
    };
  }

  // 1. Explicit shortcut prefixes: @new, @spawn, @agent
  const prefixMatch = text.match(/^@(new|spawn|agent)\s*(.*)$/i);
  if (prefixMatch) {
    const remainder = prefixMatch[2].trim();
    const title = remainder.length > 28 ? `${remainder.slice(0, 28)}…` : remainder || 'New Agent';
    return {
      isSpawn: true,
      cleanPrompt: remainder,
      suggestedTitle: title,
    };
  }

  // 2. Natural language spawn phrases:
  // e.g. "launch a new agent that says hello to me" -> cleanPrompt: "Say hello to me"
  const nlRegex =
    /^(?:please\s+|can\s+you\s+|also\s+)?(?:launch|spawn|create|start|open|run|spin\s+up|dispatch|add)\s+(?:an?\s+)?(?:new\s+|another\s+|separate\s+)?agent(?:\s+(?:that|to|for|who|which)\s+|\s*[:,-]\s*|\s+)(.*)$/i;
  const nlMatch = text.match(nlRegex);
  if (nlMatch) {
    const rawRemainder = nlMatch[1]?.trim() || '';
    const cleanPrompt = normalizeActionPrompt(rawRemainder);
    const title = cleanPrompt.length > 28 ? `${cleanPrompt.slice(0, 28)}…` : cleanPrompt || 'New Agent';
    return {
      isSpawn: true,
      cleanPrompt,
      suggestedTitle: title,
    };
  }

  // 3. Direct "new agent" prefix: e.g. "new agent: ...", "new agent to ...", "new agent that ..."
  const directRegex =
    /^(?:new\s+agent|another\s+agent)(?:\s*[:,-]\s*|\s+(?:to|that|for)\s+|\s+)(.*)$/i;
  const directMatch = text.match(directRegex);
  if (directMatch) {
    const rawRemainder = directMatch[1]?.trim() || '';
    const cleanPrompt = normalizeActionPrompt(rawRemainder);
    const title = cleanPrompt.length > 28 ? `${cleanPrompt.slice(0, 28)}…` : cleanPrompt || 'New Agent';
    return {
      isSpawn: true,
      cleanPrompt,
      suggestedTitle: title,
    };
  }

  return { isSpawn: false, cleanPrompt: text, suggestedTitle: '' };
}
