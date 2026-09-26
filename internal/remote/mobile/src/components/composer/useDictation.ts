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
  const active = useRef<Recognition | null>(null)
  const latest = useRef(onText)
  latest.current = onText
  const supported = typeof window !== 'undefined' && recognitionCtor() !== null

  useEffect(() => () => active.current?.abort(), [])

  const start = () => {
    const Ctor = recognitionCtor()
    if (!Ctor) return
    const rec = new Ctor()
    rec.lang = navigator.language || 'en-US'
    rec.continuous = true
    rec.interimResults = false
    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) latest.current(result[0].transcript.trim())
      }
    }
    const done = () => {
      if (active.current === rec) active.current = null
      setListening(false)
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

  return { supported, listening, toggle }
}
