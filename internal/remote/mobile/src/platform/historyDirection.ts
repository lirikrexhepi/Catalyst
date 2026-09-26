export type NavDirection = 'back' | 'forward' | 'push'

interface IndexedState {
  idx?: number
}

let index = 0

function stateIndex(): number | undefined {
  const s = history.state as IndexedState | null
  return typeof s?.idx === 'number' ? s.idx : undefined
}

export function initHistoryIndex() {
  const known = stateIndex()
  if (known !== undefined) {
    index = known
    return
  }
  history.replaceState({ ...(history.state as object | null), idx: index }, '')
}

export function classifyNavigation(): NavDirection {
  const known = stateIndex()
  if (known === undefined) {
    index += 1
    history.replaceState({ ...(history.state as object | null), idx: index }, '')
    return 'push'
  }
  const direction = known < index ? 'back' : known > index ? 'forward' : 'push'
  index = known
  return direction
}
