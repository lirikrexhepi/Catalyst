export interface DiagResult {
  name: string
  ok: boolean
  detail: string
  ms?: number
}

export function maskToken(token: string): string {
  if (!token) return '(none)'
  if (token.length <= 8) return `(${token.length} chars)`
  return `${token.slice(0, 4)}...${token.slice(-4)} (${token.length} chars)`
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: unknown; ms: number }> {
  const start = performance.now()
  try {
    const value = await fn()
    return { value, ms: Math.round(performance.now() - start) }
  } catch (error) {
    return { error, ms: Math.round(performance.now() - start) }
  }
}

function errText(e: unknown): string {
  if (e instanceof TypeError) return `TypeError: ${e.message || 'network failure'}`
  if (e instanceof DOMException) return `DOMException(${e.name}): ${e.message}`
  if (e instanceof Error) return `${e.name}: ${e.message}`
  return String(e)
}

export async function runDiagnostics(base: string, token: string): Promise<DiagResult[]> {
  const results: DiagResult[] = []

  results.push({
    name: 'browser online',
    ok: navigator.onLine,
    detail: navigator.onLine ? 'navigator.onLine = true' : 'navigator.onLine = FALSE (no network)',
  })

  const conn = (navigator as unknown as { connection?: { effectiveType?: string; type?: string; downlink?: number } }).connection
  results.push({
    name: 'network info',
    ok: true,
    detail: conn
      ? `type=${conn.type ?? 'n/a'} effective=${conn.effectiveType ?? 'n/a'} downlink=${conn.downlink ?? 'n/a'}`
      : 'NetworkInformation API unavailable',
  })

  results.push({
    name: 'user agent',
    ok: true,
    detail: navigator.userAgent,
  })

  if (!base) {
    results.push({ name: 'server configured', ok: false, detail: 'no server URL saved — scan QR or paste link first' })
    return results
  }
  results.push({ name: 'server configured', ok: true, detail: base })

  const reach = await timed(() => fetch(base + '/', { mode: 'no-cors', cache: 'no-store' }))
  if (reach.error !== undefined) {
    results.push({
      name: 'reach server (no-cors)',
      ok: false,
      detail: `FAILED after ${reach.ms}ms: ${errText(reach.error)} — browser could not reach the host at all (DNS / TCP / TLS)`,
      ms: reach.ms,
    })
    return results
  }
  results.push({
    name: 'reach server (no-cors)',
    ok: true,
    detail: `host reachable in ${reach.ms}ms (opaque response = network path OK)`,
    ms: reach.ms,
  })

  const ctrl = new AbortController()
  const timeout = window.setTimeout(() => ctrl.abort(), 15000)
  const api = await timed(async () => {
    const url = base + '/api/status' + (token ? `?token=${encodeURIComponent(token)}` : '')
    const res = await fetch(url, {
      cache: 'no-store',
      signal: ctrl.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const text = await res.text()
    return { status: res.status, body: text.slice(0, 200) }
  })
  window.clearTimeout(timeout)

  if (api.error !== undefined) {
    results.push({
      name: 'api /api/status',
      ok: false,
      detail: `FAILED after ${api.ms}ms: ${errText(api.error)} — reachable but API call failed (CORS / aborted / TLS)`,
      ms: api.ms,
    })
    return results
  }
  const v = api.value as { status: number; body: string }
  results.push({
    name: 'api /api/status',
    ok: v.status === 200,
    detail: `HTTP ${v.status} in ${api.ms}ms: ${v.body || '(empty)'}`,
    ms: api.ms,
  })

  return results
}
