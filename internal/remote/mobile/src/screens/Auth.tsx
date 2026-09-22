import React, { useState, useRef, useEffect } from 'react'
import jsQR from 'jsqr'
import { api, applyScannedLink } from '../api'

export default function AuthScreen({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paste, setPaste] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanSupported, setScanSupported] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanLoop = useRef<number>(0)
  const stoppedRef = useRef(false)

  useEffect(() => {
    setScanSupported(
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia
    )
    return () => stopScan()
  }, [])

  const verify = async () => {
    setBusy(true)
    setError(null)
    try {
      const s = await api.status()
      if (s.authenticated === false) {
        setError('That code did not work. Generate a fresh QR on your PC and try again.')
      } else {
        onDone()
        return
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed.')
    } finally {
      setBusy(false)
    }
  }

  const handleLink = async (link: string) => {
    if (!applyScannedLink(link)) {
      setError('Could not read that QR. Try pasting the full link instead.')
      return
    }
    stopScan()
    await verify()
  }

  const stopScan = () => {
    stoppedRef.current = true
    cancelAnimationFrame(scanLoop.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setScanning(false)
  }

  const startScan = async () => {
    setError(null)
    stoppedRef.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      streamRef.current = stream
      setScanning(true)
      const video = videoRef.current
      if (video) {
        video.srcObject = stream
        await video.play().catch(() => undefined)
      }
      const tick = async () => {
        if (stoppedRef.current) return
        const videoEl = videoRef.current
        const canvas = canvasRef.current
        if (videoEl && canvas && videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
          const w = videoEl.videoWidth
          const h = videoEl.videoHeight
          if (w > 0 && h > 0) {
            canvas.width = w
            canvas.height = h
            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            if (ctx) {
              ctx.drawImage(videoEl, 0, 0, w, h)
              try {
                const frame = ctx.getImageData(0, 0, w, h)
                const code = jsQR(frame.data, w, h)
                if (code?.data) {
                  await handleLink(code.data)
                  return
                }
              } catch { /* keep scanning */ }
            }
          }
        }
        scanLoop.current = requestAnimationFrame(() => void tick())
      }
      scanLoop.current = requestAnimationFrame(() => void tick())
    } catch {
      setError('Camera blocked. Allow camera access, or paste the link from your PC instead.')
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', overflowY: 'auto' }}>
      <div style={{
        width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
        fontSize: 28, fontWeight: 700, color: 'white'
      }}>
        O
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Orchestrator</h1>
      <p style={{ color: 'var(--text-sec)', maxWidth: 260, marginBottom: 20, fontSize: 14 }}>
        Scan the QR code shown in Remote Access on your PC and you're in.
      </p>

      {scanning ? (
        <div style={{ width: '100%', maxWidth: 300 }}>
          <video ref={videoRef} playsInline muted style={{ width: '100%', borderRadius: 12, background: 'black' }} />
          <button
            onClick={stopScan}
            style={{ marginTop: 12, padding: '10px 18px', borderRadius: 10, background: 'rgba(255,255,255,0.08)', color: 'white', fontSize: 14, cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 300 }}>
          {scanSupported && (
            <button
              onClick={() => void startScan()}
              style={{ padding: '12px 18px', borderRadius: 10, background: 'var(--accent)', color: 'white', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
            >
              Scan QR code
            </button>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={paste}
              onChange={e => setPaste(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleLink(paste) }}
              placeholder="Or paste the link from your PC"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10,
                padding: '10px 14px',
                fontSize: 13,
                color: 'white',
                textAlign: 'center'
              }}
            />
            <button
              onClick={() => void handleLink(paste)}
              disabled={busy || !paste.trim()}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.08)',
                color: 'white',
                fontWeight: 700,
                fontSize: 14,
                cursor: busy ? 'default' : 'pointer',
                opacity: !paste.trim() ? 0.5 : 1
              }}
            >
              {busy ? '...' : 'Go'}
            </button>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: 'none' }} />
      {error && <div style={{ color: '#f87171', fontSize: 12, marginTop: 12, maxWidth: 280 }}>{error}</div>}
      {!scanSupported && !scanning && (
        <p style={{ color: 'var(--text-mut)', fontSize: 12, maxWidth: 280, marginTop: 16 }}>
          This browser can't use the camera — paste the link from your PC above.
        </p>
      )}
    </div>
  )
}
