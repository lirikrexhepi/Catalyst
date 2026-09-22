import React, { useState, useRef, useEffect } from 'react'
import jsQR from 'jsqr'
import { QrCode } from 'lucide-react'
import { api, applyScannedLink, getBase, getToken } from '../api'
import { runDiagnostics, maskToken, DiagResult } from '../debug'
import wallpaperImg from '../assets/wallpaper.png'

export default function AuthScreen({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paste, setPaste] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanSupported, setScanSupported] = useState(false)
  const [showManual, setShowManual] = useState(false)
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
    const supported =
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia
    setScanSupported(supported)
    if (!supported) {
      setShowManual(true)
    }
    return () => stopScan()
  }, [])

  const verify = async () => {
    setBusy(true)
    setError(null)
    try {
      const s = await api.status()
      if (s.authenticated === false) {
        setError('That code did not work. Generate a fresh QR on your PC and try again.')
        setShowManual(true)
      } else {
        onDone()
        return
      }
    } catch (e) {
      setError(`Connection failed: ${e instanceof Error ? e.message : String(e)}`)
      setShowManual(true)
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
      setShowManual(true)
      return
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(50) } catch { /* ignore */ }
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
      setError('Camera access unavailable. Enter the link from your PC instead.')
      setShowManual(true)
    }
  }

  return (
    <div className="screen pair-screen">
      {/* Upper backdrop wallpaper */}
      <div className="pair-hero" aria-hidden="true">
        <img src={wallpaperImg} alt="" className="pair-wallpaper" />
        <div className="pair-hero-vignette" />
      </div>

      {/* Foreground scroll & bottom card */}
      <div className="scroll pair-scroll">
        <div className="pair-spacer" />

        <div className="pair-card">
          <div className="pair-brand">the orchestrator.</div>
          <h1 className="pair-title">
            Your agents, from<br />your pocket
          </h1>
          <p className="pair-desc">
            On your PC open Settings, then Remote access, and scan the code shown there.
          </p>

          {scanning ? (
            <div className="pair-scanner">
              <div className="pair-video-wrap">
                <video ref={videoRef} playsInline muted autoPlay aria-label="Camera preview for scanning" />
                <div className="pair-scan-reticle">
                  <div className="reticle-corner top-left" />
                  <div className="reticle-corner top-right" />
                  <div className="reticle-corner bottom-left" />
                  <div className="reticle-corner bottom-right" />
                  <div className="reticle-laser" />
                </div>
              </div>
              <button className="btn pair-cancel-btn" onClick={stopScan}>
                Cancel scan
              </button>
            </div>
          ) : (
            <div className="pair-actions">
              {scanSupported && (
                <button
                  className="btn primary pair-scan-btn"
                  onClick={() => void startScan()}
                  disabled={busy}
                >
                  <QrCode size={20} strokeWidth={2.2} />
                  <span>Scan the code</span>
                </button>
              )}

              {/* Link input is hidden by default; revealed only if QR/camera fails or manually requested */}
              {showManual ? (
                <div className="pair-manual-box">
                  <label className="pair-manual-label" htmlFor="pair-link">
                    Or paste the link from your PC
                  </label>
                  <div className="pair-input-group">
                    <input
                      id="pair-link"
                      className="input pair-input"
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
                    <button
                      className="btn pair-connect-btn"
                      onClick={() => void handleLink(paste)}
                      disabled={busy || !paste.trim()}
                    >
                      {busy ? 'Connecting…' : 'Connect'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="pair-link-trigger"
                  onClick={() => setShowManual(true)}
                >
                  Trouble scanning? Enter link manually
                </button>
              )}
            </div>
          )}

          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {error && (
            <div className="pair-err" role="alert">
              {error}
            </div>
          )}

          <button
            type="button"
            className="pair-diag-trigger"
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
              {diagRunning && <div className="when">Running checks…</div>}
              {diagResults?.map((r, i) => (
                <div key={i}>
                  <span style={{ color: r.ok ? 'var(--ok)' : 'var(--fault)', fontWeight: 700 }}>
                    {r.ok ? 'Passed' : 'Failed'}
                  </span>{' '}
                  {r.name}
                  <div className="when">{r.detail}</div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
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
