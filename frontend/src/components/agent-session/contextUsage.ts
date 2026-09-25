import type { RuntimeEvent } from './eventReducer';

export interface ContextUsage {
  tokens: number;
  window?: number;
}

export function nextContext(prev: ContextUsage | undefined, event: RuntimeEvent): ContextUsage | undefined {
  const usage = event.usage;
  if (!usage) return prev;
  const tokens = usage.contextTokens && usage.contextTokens > 0 ? usage.contextTokens : prev?.tokens;
  const window = usage.contextWindow && usage.contextWindow > 0 ? usage.contextWindow : prev?.window;
  if (!tokens) return prev;
  if (prev && prev.tokens === tokens && prev.window === window) return prev;
  return { tokens, window };
}

export function latestContext(events: RuntimeEvent[] | undefined): ContextUsage | undefined {
  let context: ContextUsage | undefined;
  for (const event of events ?? []) {
    if (event.kind === 'usage') context = nextContext(context, event);
  }
  return context;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}
