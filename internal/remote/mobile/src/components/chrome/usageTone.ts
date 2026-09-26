export function usageRatio(usage?: { tokens: number; window?: number }): number {
  if (!usage || usage.tokens <= 0 || !usage.window) return 0
  return Math.min(1, usage.tokens / usage.window)
}

export function usageTone(ratio: number): string {
  if (ratio >= 0.9) return 'var(--usage-high)'
  if (ratio >= 0.75) return 'var(--usage-mid)'
  return 'var(--usage-low)'
}
