import React, { useState, useRef, useEffect } from 'react'
import jsQR from 'jsqr'
import { api, applyScannedLink, getBase, getToken } from '../api'
import { runDiagnostics, maskToken, DiagResult } from '../debug'

export default function AuthScreen({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paste, setPaste] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanSupported, setScanSupported] = useState(false)
  const [showDiag, setShowDiag] = useState(false)
  const [diagRunning, setDiagRunning] = useState(false)
  const [diagResults, setDiagResults] = useState<DiagResult[] | null>(null)
  const [copied, setCopied] = useState(false)
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
      setError(`Connection failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const runDiag = async () => {
    setDiagRunning(true)
    setDiagResults(null)
    try {
      setDiagResults(await runDiagnostics(getBase(), getToken()))
    } finally {
      setDiagRunning(false)
    }
  }

  const copyDiag = async () => {
    const payload = JSON.stringify({
      server: getBase(),
      token: maskToken(getToken()),
      results: diagResults,
    }, null, 2)
    try {
      await navigator.clipboard.writeText(payload)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Clipboard blocked. Screenshot this screen instead.')
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

  useEffect(() => {
    if (!scanning) return
    const video = videoRef.current
    const stream = streamRef.current
    if (!video || !stream) return
    video.srcObject = stream
    void video.play().catch(() => undefined)
  }, [scanning])

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
    <div className="screen">
      <div className="scroll">
        <div className="pair">
          <h1>Your agents, from your pocket</h1>
          <p>On your PC open Settings, then Remote access, and scan the code shown there.</p>

          {scanning ? (
            <>
              <video ref={videoRef} playsInline muted aria-label="Camera preview for scanning" />
              <button className="btn" onClick={stopScan}>
                Cancel scan
              </button>
            </>
          ) : (
            <>
              {scanSupported && (
                <button className="btn primary" onClick={() => void startScan()}>
                  Scan the code
                </button>
              )}
              <label className="label" htmlFor="pair-link" style={{ marginTop: 8 }}>
                Or paste the link from your PC
              </label>
              <input
                id="pair-link"
                className="input"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleLink(paste)
                }}
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="https://…"
              />
              <button className="btn" onClick={() => void handleLink(paste)} disabled={busy || !paste.trim()}>
                {busy ? 'Connecting' : 'Connect'}
              </button>
              {!scanSupported && <p style={{ fontSize: 14 }}>This browser cannot use the camera, so paste the link instead.</p>}
            </>
          )}

          <canvas ref={canvasRef} style={{ display: 'none' }} />
          {error && (
            <div className="err" role="alert">
              {error}
            </div>
          )}

          <button
            className="btn"
            style={{ background: 'none', border: 0, color: 'var(--text-3)', fontWeight: 500 }}
            aria-expanded={showDiag}
            onClick={() => {
              setShowDiag((v) => !v)
              if (!showDiag && !diagResults) void runDiag()
            }}
          >
            {showDiag ? 'Hide connection check' : 'Check the connection'}
          </button>
          {showDiag && (
            <div className="diag">
              <div>Server: {getBase() || 'none saved'}</div>
              <div>Token: {maskToken(getToken())}</div>
              {diagRunning && <div className="when">Running checks</div>}
              {diagResults?.map((r, i) => (
                <div key={i}>
                  <span style={{ color: r.ok ? 'var(--ok)' : 'var(--fault)', fontWeight: 700 }}>{r.ok ? 'Passed' : 'Failed'}</span> {r.name}
                  <div className="when">{r.detail}</div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={() => void runDiag()} disabled={diagRunning}>
                  Run again
                </button>
                {diagResults && (
                  <button className="btn" onClick={() => void copyDiag()}>
                    {copied ? 'Copied' : 'Copy results'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
