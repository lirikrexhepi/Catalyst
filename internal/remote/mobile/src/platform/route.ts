export function replaceRoute(hash: string) {
  const next = hash.startsWith('#') ? hash : `#${hash}`
  if (window.location.hash === next) return
  window.location.replace(next)
}

export function clearRoute() {
  history.replaceState(history.state, '', window.location.pathname + window.location.search)
}
