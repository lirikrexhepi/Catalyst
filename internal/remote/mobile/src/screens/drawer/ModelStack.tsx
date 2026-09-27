import { GlassCircle } from '../../ui'
import { ProviderIcon } from '../../components/modelPicker/ProviderIcon'

const SIZE = 30
const OFFSET = 18
const ICON = 16
const SHOWN = 2
const BACK_SHIFT = OFFSET / 2 - SIZE / 2

export function ModelStack({ drivers }: { drivers: string[] }) {
  const shown = drivers.slice(-SHOWN)
  return (
    <span className="model-stack" style={{ width: SIZE + OFFSET * Math.max(0, shown.length - 1), height: SIZE }} aria-hidden>
      {shown.map((driver, i) => {
        const behind = i < shown.length - 1
        return (
          <GlassCircle
            key={driver}
            as="span"
            size={SIZE}
            fill="var(--surface-3)"
            pressable={false}
            style={{ position: 'absolute', left: i * OFFSET, top: 0, zIndex: i + 1 }}
          >
            <span style={behind ? { transform: `translateX(${BACK_SHIFT}px)`, display: 'grid' } : { display: 'grid' }}>
              <ProviderIcon driver={driver} size={ICON} />
            </span>
          </GlassCircle>
        )
      })}
    </span>
  )
}
