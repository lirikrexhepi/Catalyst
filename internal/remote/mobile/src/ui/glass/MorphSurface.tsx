import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { SpringDriver, type Render } from '../motion/SpringDriver'
import { SPRINGS, type SpringConfig } from '../motion/spring'
import type { GlassBorderStyle } from './GlassBorder'
import { GlassSquircle } from './GlassSquircle'

export interface MorphSurfaceProps {
  width: number
  height: number
  maxHeight: number
  radius: number
  fill: string
  border?: GlassBorderStyle | false
  spring?: SpringConfig
  children?: ReactNode
}

const BLEND = 48

function maxOffset(maxHeight: number, radius: number): number {
  const half = maxHeight / 2
  const corner = Math.min(radius * 2, half)
  return Math.max(0, 2 * (half - BLEND / 2 - corner))
}

const shift = (factor: number): Render<'d'> => (v) => ({ transform: `translateY(${v.d * factor}px)` })

export function MorphSurface({ width, height, maxHeight, radius, fill, border = {}, spring = SPRINGS.bouncy, children }: MorphSurfaceProps) {
  const slice = useRef<HTMLDivElement | null>(null)
  const copy = useRef<HTMLDivElement | null>(null)
  const clip = useRef<HTMLDivElement | null>(null)
  const content = useRef<HTMLDivElement | null>(null)
  const drivers = useRef<SpringDriver<'d'>[]>([])
  const offset = Math.min(Math.max(0, maxHeight - height), maxOffset(maxHeight, radius))
  const first = useRef(offset)

  useLayoutEffect(() => {
    const parts: [HTMLDivElement | null, number][] = [
      [slice.current, 0.5],
      [copy.current, 0.5],
      [clip.current, 1],
      [content.current, -1],
    ]
    const list = parts
      .filter((p): p is [HTMLDivElement, number] => p[0] !== null)
      .map(([el, factor]) => new SpringDriver<'d'>(el, { d: first.current }, shift(factor)))
    list.forEach((d) => d.jump({ d: first.current }))
    drivers.current = list
    return () => list.forEach((d) => d.stop())
  }, [])

  useEffect(() => {
    drivers.current.forEach((d) => d.to({ d: offset }, spring))
  }, [offset, spring])

  const half = maxHeight / 2
  const mask = `linear-gradient(#000 calc(100% - ${BLEND}px), transparent)`
  const shape = { width, height: maxHeight, radius, fill, border }

  return (
    <div style={{ position: 'absolute', left: 0, bottom: 0, width, height: maxHeight, pointerEvents: 'none' }}>
      <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: half - BLEND / 2, bottom: 0, overflow: 'hidden' }}>
        <GlassSquircle {...shape} style={{ position: 'absolute', left: 0, bottom: 0 }} />
      </div>
      <div
        ref={slice}
        aria-hidden
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: half + BLEND / 2, overflow: 'hidden', WebkitMaskImage: mask, maskImage: mask }}
      >
        <div ref={copy} style={{ position: 'absolute', left: 0, top: 0, width, height: maxHeight }}>
          <GlassSquircle {...shape} />
        </div>
      </div>
      <div ref={clip} style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: radius }}>
        <div ref={content} style={{ position: 'absolute', inset: 0 }}>
          {children}
        </div>
      </div>
    </div>
  )
}
