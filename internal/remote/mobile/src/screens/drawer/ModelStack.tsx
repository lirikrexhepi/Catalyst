import type { CSSProperties } from 'react'
import { GlassCircle } from '../../ui'
import { ProviderIcon } from '../../components/modelPicker/ProviderIcon'

const SLOT = 32
const SOLO_ICON = 17
const PAIR = 22
const PAIR_ICON = 12
const GAP = 2
const OFFSET = SLOT - PAIR
const CUT = `radial-gradient(circle ${PAIR / 2 + GAP}px at ${OFFSET + PAIR / 2}px ${OFFSET + PAIR / 2}px, transparent 96%, #000 100%)`
const FILL = 'var(--surface-3)'

const BACK: CSSProperties = { position: 'absolute', left: 0, top: 0, WebkitMaskImage: CUT, maskImage: CUT }
const FRONT: CSSProperties = { position: 'absolute', left: OFFSET, top: OFFSET }

export function ModelStack({ drivers }: { drivers: string[] }) {
  const shown = drivers.slice(-2)
  return (
    <span className="model-stack" style={{ width: SLOT, height: SLOT }} aria-hidden>
      {shown.length === 1 ? (
        <GlassCircle as="span" size={SLOT} fill={FILL} pressable={false}>
          <ProviderIcon driver={shown[0]} size={SOLO_ICON} />
        </GlassCircle>
      ) : null}
      {shown.length === 2 ? (
        <>
          <GlassCircle as="span" size={PAIR} fill={FILL} pressable={false} style={BACK}>
            <ProviderIcon driver={shown[0]} size={PAIR_ICON} />
          </GlassCircle>
          <GlassCircle as="span" size={PAIR} fill={FILL} pressable={false} style={FRONT}>
            <ProviderIcon driver={shown[1]} size={PAIR_ICON} />
          </GlassCircle>
        </>
      ) : null}
    </span>
  )
}
