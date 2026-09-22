export interface ExtractedTask {
  action?: 'spawn' | 'message';
  targetThreadId?: string;
  title: string;
  prompt: string;
  cwd?: string;
}

export interface ExtractedPlan {
  proseBefore: string;
  tasks: ExtractedTask[];
  proseAfter: string;
}

function sanitizeTasks(rawTasks: any[]): ExtractedTask[] {
  return rawTasks
    .filter((t: any) => t && (t.title || t.prompt))
    .map((t: any) => ({
      action: t.action === 'message' ? ('message' as const) : ('spawn' as const),
      targetThreadId: t.targetThreadId ? String(t.targetThreadId).trim() : undefined,
      title: String(t.title || 'Task').trim(),
      prompt: String(t.prompt || t.title || '').trim(),
      cwd: t.cwd ? String(t.cwd).trim() : undefined,
    }));
}

function extractBalancedJsonObject(text: string, startIdx: number): string | null {
  let openCount = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < text.length; i++) {
    const char = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') {
        openCount++;
      } else if (char === '}') {
        openCount--;
        if (openCount === 0) {
          return text.slice(startIdx, i + 1);
        }
      }
    }
  }
  return null;
}

/**
 * Extracts structured task plan JSON from an orchestrator message,
 * separating preceding prose, the parsed tasks, and any following prose.
 */
export function extractPlanFromText(text: string): ExtractedPlan | null {
  if (!text) return null;

  // 1. Check for standard ```composer:tasks ... ``` code block
  const composerMatch = text.match(/```composer:tasks\s*([\s\S]*?)```/);
  if (composerMatch && composerMatch.index !== undefined) {
    try {
      const parsed = JSON.parse(composerMatch[1].trim());
      if (parsed && Array.isArray(parsed.tasks)) {
        const tasks = sanitizeTasks(parsed.tasks);
        if (tasks.length > 0) {
          const startIndex = composerMatch.index;
          const endIndex = startIndex + composerMatch[0].length;
          return {
            proseBefore: text.slice(0, startIndex).trim(),
            tasks,
            proseAfter: text.slice(endIndex).trim(),
          };
        }
      }
    } catch {
      // Continue to next matcher
    }
  }

  // 2. Check for generic code fences containing "tasks"
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?"tasks"[\s\S]*?)\s*```/);
  if (fenceMatch && fenceMatch.index !== undefined) {
    try {
      const content = fenceMatch[1].trim();
      const firstBrace = content.indexOf('{');
      if (firstBrace !== -1) {
        const jsonStr = extractBalancedJsonObject(content, firstBrace);
        if (jsonStr) {
          const parsed = JSON.parse(jsonStr);
          if (parsed && Array.isArray(parsed.tasks)) {
            const tasks = sanitizeTasks(parsed.tasks);
            if (tasks.length > 0) {
              const startIndex = fenceMatch.index;
              const endIndex = startIndex + fenceMatch[0].length;
              return {
                proseBefore: text.slice(0, startIndex).trim(),
                tasks,
                proseAfter: text.slice(endIndex).trim(),
              };
            }
          }
        }
      }
    } catch {
      // Continue
    }
  }

  // 3. Raw JSON object in text
  const tasksIdx = text.indexOf('"tasks"');
  if (tasksIdx !== -1) {
    // Find the enclosing opening brace before "tasks"
    const openBrace = text.lastIndexOf('{', tasksIdx);
    if (openBrace !== -1) {
      const jsonStr = extractBalancedJsonObject(text, openBrace);
      if (jsonStr) {
        try {
          const parsed = JSON.parse(jsonStr);
          if (parsed && Array.isArray(parsed.tasks)) {
            const tasks = sanitizeTasks(parsed.tasks);
            if (tasks.length > 0) {
              let startIndex = openBrace;
              let endIndex = openBrace + jsonStr.length;

              // Check if preceded by an opening code fence
              const prefix = text.slice(0, startIndex);
              const fenceBefore = prefix.match(/```[a-zA-Z0-9_:-]*\s*$/);
              if (fenceBefore && fenceBefore.index !== undefined) {
                startIndex = fenceBefore.index;
              }

              // Check if followed by a closing code fence
              const suffix = text.slice(endIndex);
              const fenceAfter = suffix.match(/^\s*```/);
              if (fenceAfter) {
                endIndex += fenceAfter[0].length;
              }

              return {
                proseBefore: text.slice(0, startIndex).trim(),
                tasks,
                proseAfter: text.slice(endIndex).trim(),
              };
            }
          }
        } catch {
          // Failed to parse
        }
      }
    }
  }

  return null;
}