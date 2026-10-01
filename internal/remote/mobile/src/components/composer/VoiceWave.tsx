import { useEffect, useRef, type MutableRefObject } from 'react'

const BARS = 5

function useMicAnalyser(active: boolean) {
  const analyser = useRef<AnalyserNode | null>(null)
  const data = useRef<Uint8Array<ArrayBuffer> | null>(null)

  useEffect(() => {
    if (!active || !navigator.mediaDevices?.getUserMedia) return
    let stream: MediaStream | null = null
    let context: AudioContext | null = null
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then((media) => {
        if (cancelled) {
          media.getTracks().forEach((t) => t.stop())
          return
        }
        stream = media
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        context = new Ctor()
        const node = context.createAnalyser()
        node.fftSize = 64
        node.smoothingTimeConstant = 0.6
        context.createMediaStreamSource(media).connect(node)
        analyser.current = node
        data.current = new Uint8Array(new ArrayBuffer(node.frequencyBinCount))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      analyser.current = null
      data.current = null
      stream?.getTracks().forEach((t) => t.stop())
      void context?.close()
    }
  }, [active])

  return { analyser, data }
}

const sharesMicSafely =
  typeof navigator !== 'undefined' &&
  !/iPhone|iPad|iPod/.test(navigator.userAgent) &&
  !(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function VoiceWave({ active, activity }: { active: boolean; activity: MutableRefObject<number> }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([])
  const { analyser, data } = useMicAnalyser(active && sharesMicSafely)

  useEffect(() => {
    if (!active) return
    let frame = 0
    const levels = new Array(BARS).fill(0.15)
    const tick = (now: number) => {
      const node = analyser.current
      const buf = data.current
      let targets: number[]
      if (node && buf) {
        node.getByteFrequencyData(buf)
        const span = Math.max(1, Math.floor(buf.length / (BARS + 2)))
        targets = Array.from({ length: BARS }, (_, i) => {
          let sum = 0
          for (let j = 0; j < span; j++) sum += buf[(i + 1) * span + j] ?? 0
          return Math.min(1, (sum / span / 255) * 1.8)
        })
      } else {
        const recent = Math.max(0, 1 - (now - activity.current) / 600)
        targets = Array.from({ length: BARS }, (_, i) => 0.18 + recent * (0.5 + 0.35 * Math.sin(now / 90 + i * 1.3)))
      }
      for (let i = 0; i < BARS; i++) {
        const target = Math.max(0.14, targets[i])
        levels[i] += (target - levels[i]) * (target > levels[i] ? 0.55 : 0.18)
        const el = bars.current[i]
        if (el) el.style.transform = `scaleY(${levels[i].toFixed(3)})`
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, analyser, data, activity])

  return (
    <span className="voice-wave" aria-hidden>
      {Array.from({ length: BARS }, (_, i) => (
        <span key={i} ref={(el) => (bars.current[i] = el)} className="voice-wave-bar" />
      ))}
    </span>
  )
}
