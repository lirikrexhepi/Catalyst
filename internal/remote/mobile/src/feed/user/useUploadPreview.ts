import { useEffect, useState } from 'react'
import { api } from '../../api'

const cache = new Map<string, Promise<string | null>>()

function load(path: string): Promise<string | null> {
  let pending = cache.get(path)
  if (!pending) {
    pending = api
      .uploadPreview(path)
      .then((r) => r.dataUrl || null)
      .catch(() => null)
    cache.set(path, pending)
  }
  return pending
}

export function useUploadPreview(path: string, enabled: boolean): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    if (!enabled) {
      setUrl(null)
      return
    }
    let alive = true
    void load(path).then((value) => {
      if (alive) setUrl(value)
    })
    return () => {
      alive = false
    }
  }, [path, enabled])
  return url
}
