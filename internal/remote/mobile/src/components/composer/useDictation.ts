import { useEffect, useRef, useState } from 'react'

interface RecognitionResult {
  isFinal: boolean
  0: { transcript: string }
}

interface RecognitionEvent {
  resultIndex: number
  results: ArrayLike<RecognitionResult>
}

interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: RecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type RecognitionCtor = new () => Recognition

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [draft, setDraft] = useState('')
  const active = useRef<Recognition | null>(null)
  const latest = useRef(onText)
  const activity = useRef(0)
  latest.current = onText
  const supported = typeof window !== 'undefined' && recognitionCtor() !== null

  useEffect(() => () => active.current?.abort(), [])

  const start = () => {
    const Ctor = recognitionCtor()
    if (!Ctor) return
    const rec = new Ctor()
    rec.lang = navigator.language || 'en-US'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (event) => {
      if (active.current !== rec) return
      activity.current = performance.now()
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const transcript = result[0].transcript.trim()
        if (!transcript) continue
        if (result.isFinal) latest.current(transcript)
        else interim += (interim ? ' ' : '') + transcript
      }
      setDraft(interim)
    }
    const done = () => {
      if (active.current === rec) active.current = null
      setListening(false)
      setDraft('')
    }
    rec.onend = done
    rec.onerror = done
    active.current = rec
    rec.start()
    setListening(true)
  }

  const toggle = () => {
    if (active.current) active.current.stop()
    else start()
  }

  const cancel = () => {
    const rec = active.current
    active.current = null
    rec?.abort()
    setListening(false)
    setDraft('')
  }

  return { supported, listening, draft, toggle, cancel, activity }
}
