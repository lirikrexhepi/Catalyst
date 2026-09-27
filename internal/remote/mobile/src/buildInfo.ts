export function buildStamp(): string {
  const parts: string[] = []
  if (__APP_VERSION__) parts.push(`v${__APP_VERSION__}`)
  const built = new Date(__BUILD_TIME__)
  if (!Number.isNaN(built.getTime())) {
    const day = built.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    const time = built.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    parts.push(`built ${day} ${time}`)
  }
  if (__BUILD_COMMIT__) parts.push(__BUILD_COMMIT__)
  return parts.join(' · ')
}
