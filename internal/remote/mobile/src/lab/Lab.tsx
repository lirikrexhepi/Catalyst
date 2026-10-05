import { useState } from 'react'
import { ChevronDown, Menu, MessageSquarePlus, Mic, Monitor, Paperclip, Play, Send, Smartphone } from '../icons'
import { DEFAULT_RIM_LIGHT, GlassCircle, GlassPill, GlassSegmented, GlassSquircle, Squircle, type GlassBorderStyle, type StrokeAlign } from '../ui'
import { FpsMeter } from './FpsMeter'
import { ModelSwitch } from '../components/chrome/ModelSwitch'
import { UserBubble } from '../feed/user/UserBubble'
import '../styles/tokens.css'
import '../styles/chat.css'

const DEVICES = [
  { value: 'phone', label: 'Phone', icon: <Smartphone size={17} strokeWidth={1.8} /> },
  { value: 'desktop', label: 'Desktop', icon: <Monitor size={17} strokeWidth={1.8} /> },
] as const

const FEED = Array.from({ length: 40 }, (_, i) =>
  i % 3 === 0
    ? 'Change the way the modal looks, and dont forget to turn on the dev server.'
    : i % 3 === 1
      ? 'Im on it, first changing the modal based on the provided images.'
      : 'Then starting the dev server by running npm run dev.',
)

const GRAY = 'linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.07))'
const BLUE = 'rgba(52, 96, 160, 0.62)'

interface Knobs {
  angle: number
  intensity: number
  backIntensity: number
  base: number
  falloff: number
  strokeWidth: number
  align: StrokeAlign
  glowWidth: number
  glowOpacity: number
  grid: boolean
}

const INITIAL: Knobs = {
  angle: DEFAULT_RIM_LIGHT.angle,
  intensity: DEFAULT_RIM_LIGHT.intensity,
  backIntensity: DEFAULT_RIM_LIGHT.backIntensity,
  base: DEFAULT_RIM_LIGHT.base,
  falloff: DEFAULT_RIM_LIGHT.falloff,
  strokeWidth: 1,
  align: 'inside',
  glowWidth: 0,
  glowOpacity: 0.3,
  grid: false,
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}

function Slider({ label, value, min, max, step, onChange }: SliderProps) {
  return (
    <label className="knob">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <output>{value}</output>
    </label>
  )
}

export function Lab() {
  const [k, setK] = useState<Knobs>(INITIAL)
  const [device, setDevice] = useState<'phone' | 'desktop'>('phone')
  const [frost, setFrost] = useState(14)
  const [stress, setStress] = useState(false)
  const set = <K extends keyof Knobs>(key: K) => (v: Knobs[K]) => setK((prev) => ({ ...prev, [key]: v }))

  const border: GlassBorderStyle = {
    strokeWidth: k.strokeWidth,
    align: k.align,
    light: { angle: k.angle, intensity: k.intensity, backIntensity: k.backIntensity, base: k.base, falloff: k.falloff },
    glow: k.glowWidth > 0 ? { width: k.glowWidth, opacity: k.glowOpacity } : undefined,
  }

  return (
    <div className={k.grid ? 'lab grid' : 'lab'}>
      <FpsMeter />
      <section className="stage">
        <div className="bubble-row">
          <UserBubble
            content="Change the way the modal looks, and dont forget to turn on the dev server, just run npm run dev."
            files={[{ path: 'C:/uploads/one.png', mime: 'image/png' }, { path: 'C:/uploads/notes.txt', name: 'notes.txt', mime: 'text/plain' }]}
          />
        </div>
        <div className="ring-row">
          {[0, 0.3, 0.8, 0.95].map((u) => (
            <ModelSwitch key={u} label={`Usage ${Math.round(u * 100)}%`} usage={u} onClick={() => undefined} />
          ))}
        </div>
        <div className="row">
          <GlassSegmented options={DEVICES} value={device} onChange={setDevice} height={44} fill={GRAY} border={border} lensBorder={border} />
          <span className="hint">Tap, or drag and flick the lens</span>
        </div>

        <div className="frost-demo">
          <div className="feed">
            {FEED.map((line, i) => (
              <p key={i} className={i % 3 === 0 ? 'mine' : undefined}>
                {line}
              </p>
            ))}
          </div>
          <GlassSquircle radius={26} height={86} fill="rgba(40,40,42,0.55)" frost={frost} border={border} className="composer overlay" style={{ position: 'absolute' }}>
            <span className="placeholder">Frosted over scrolling content</span>
            <div className="composer-bar">
              <Paperclip size={19} strokeWidth={1.8} className="muted" />
              <GlassCircle size={34} fill={BLUE} border={border} aria-label="Send over frost">
                <Send size={15} strokeWidth={1.9} />
              </GlassCircle>
            </div>
          </GlassSquircle>
        </div>

        {stress ? (
          <div className="stress">
            {Array.from({ length: 24 }, (_, i) => (
              <GlassCircle key={i} size={38} fill={GRAY} frost={frost} border={border} aria-label={`Stress ${i}`}>
                <Play size={15} strokeWidth={1.8} />
              </GlassCircle>
            ))}
          </div>
        ) : null}

        <div className="row">
          <GlassCircle size={38} fill={GRAY} border={border} aria-label="Menu">
            <Menu size={18} strokeWidth={1.8} />
          </GlassCircle>
          <GlassPill as="button" height={38} fill={GRAY} border={border} style={{ gap: 8, padding: '0 8px 0 12px' }}>
            <span className="model-mark" />
            <span className="label">Muse Spark 1.3</span>
            <GlassCircle as="span" size={20} fill="rgba(0,0,0,0.25)" border={{ ...border, light: { ...border.light, color: '#e0763c', base: 0.5 } }}>
              <ChevronDown size={13} strokeWidth={2.4} color="#e0763c" />
            </GlassCircle>
          </GlassPill>
          <GlassCircle size={38} fill={GRAY} border={border} aria-label="Run">
            <Play size={17} strokeWidth={1.8} />
          </GlassCircle>
          <GlassCircle size={38} fill={GRAY} border={border} aria-label="New chat">
            <MessageSquarePlus size={17} strokeWidth={1.8} />
          </GlassCircle>
        </div>

        <GlassSquircle width={300} height={86} radius={26} fill={GRAY} border={border} className="composer">
          <span className="placeholder">Enter your text here....</span>
          <div className="composer-bar">
            <Paperclip size={19} strokeWidth={1.8} className="muted" />
            <div className="composer-actions">
              <GlassCircle size={34} fill="rgba(52, 96, 160, 0.35)" border={border} aria-label="Dictate">
                <Mic size={16} strokeWidth={1.9} />
              </GlassCircle>
              <GlassCircle size={34} fill={BLUE} border={border} aria-label="Send">
                <Send size={15} strokeWidth={1.9} />
              </GlassCircle>
            </div>
          </div>
        </GlassSquircle>

        <GlassSquircle width={300} height={206} radius={34} fill={GRAY} border={border} className="sheet">
          {['Low', 'Medium', 'High', 'Xhigh'].map((level) => (
            <GlassSquircle key={level} as="button" width={128} height={48} radius={20} fill="rgba(0,0,0,0.28)" border={border} className="effort">
              {level}
            </GlassSquircle>
          ))}
          <GlassSquircle as="button" height={48} radius={20} fill="rgba(0,0,0,0.28)" border={border} className="effort wide">
            Max
          </GlassSquircle>
        </GlassSquircle>

        <GlassCircle size={200} fill={BLUE} border={border} aria-label="Large mic">
          <Mic size={76} strokeWidth={2.2} />
        </GlassCircle>

        <div className="compare">
          <Squircle width={220} height={220} radius={60} fill="#3a5a8c" />
          <div className="ghost" />
          <p>Filled: Figma 100% smoothing. Outline: plain border-radius 60px.</p>
        </div>
      </section>

      <aside className="knobs">
        <Slider label="Light angle" value={k.angle} min={0} max={360} step={1} onChange={set('angle')} />
        <Slider label="Intensity" value={k.intensity} min={0} max={1} step={0.01} onChange={set('intensity')} />
        <Slider label="Back intensity" value={k.backIntensity} min={0} max={1} step={0.01} onChange={set('backIntensity')} />
        <Slider label="Base" value={k.base} min={0} max={1} step={0.01} onChange={set('base')} />
        <Slider label="Falloff" value={k.falloff} min={0.2} max={6} step={0.1} onChange={set('falloff')} />
        <Slider label="Stroke" value={k.strokeWidth} min={0.5} max={4} step={0.25} onChange={set('strokeWidth')} />
        <Slider label="Glow width" value={k.glowWidth} min={0} max={8} step={0.5} onChange={set('glowWidth')} />
        <Slider label="Glow opacity" value={k.glowOpacity} min={0} max={1} step={0.05} onChange={set('glowOpacity')} />
        <label className="knob">
          <span>Align</span>
          <select value={k.align} onChange={(e) => set('align')(e.target.value as StrokeAlign)}>
            <option value="inside">inside</option>
            <option value="center">center</option>
            <option value="outside">outside</option>
          </select>
        </label>
        <Slider label="Frost blur" value={frost} min={0} max={40} step={1} onChange={setFrost} />
        <label className="knob">
          <span>Stress x24</span>
          <input type="checkbox" checked={stress} onChange={(e) => setStress(e.target.checked)} />
        </label>
        <label className="knob">
          <span>Grid</span>
          <input type="checkbox" checked={k.grid} onChange={(e) => set('grid')(e.target.checked)} />
        </label>
      </aside>
    </div>
  )
}
