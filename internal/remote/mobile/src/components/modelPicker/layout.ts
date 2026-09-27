export const PICKER = {
  radius: 30,
  fill: 'var(--surface)',
  listTop: 17,
  row: 49,
  listGap: 25,
  bar: 64,
  accounts: 50,
  barWidth: 325,
  barRadius: 24,
  barInset: 10,
  frame: 500,
  effortTop: 26,
  effortButton: { width: 135, height: 55, radius: 24 },
  effortRowGap: 22,
  effortColGap: 15,
  effortGap: 20,
} as const

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function listHeight(rows: number): number {
  const content = PICKER.listTop + rows * PICKER.row + PICKER.listGap + PICKER.bar + PICKER.barInset
  return clamp(content, 0, PICKER.frame)
}

export function effortHeight(choices: number, toggles = 0): number {
  const rows = Math.max(1, Math.ceil(choices / 2) + Math.ceil(toggles / 2))
  const grid = rows * PICKER.effortButton.height + (rows - 1) * PICKER.effortRowGap
  return PICKER.effortTop + grid + PICKER.effortGap + PICKER.bar + PICKER.barInset
}
