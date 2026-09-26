import { forwardRef, useRef, type HTMLAttributes } from 'react'
import type { CornerRadii } from '../geometry/squircle'
import { useElementSize } from '../geometry/useElementSize'
import { useMergedRef } from '../geometry/useMergedRef'
import { useShapeStyle } from '../geometry/useShapeStyle'

export interface SquircleProps extends HTMLAttributes<HTMLDivElement> {
  width?: number
  height?: number
  radius: CornerRadii
  smoothing?: number
  fill?: string
}

export const Squircle = forwardRef<HTMLDivElement, SquircleProps>(function Squircle(
  { width, height, radius, smoothing = 1, fill, style, children, ...rest },
  ref,
) {
  const own = useRef<HTMLDivElement | null>(null)
  const setRef = useMergedRef(own, ref)
  const fixed = width !== undefined && height !== undefined
  const measured = useElementSize(own, !fixed)
  const shape = useShapeStyle(fixed ? { width, height } : measured, radius, smoothing)
  return (
    <div ref={setRef} style={{ width, height, background: fill, ...shape, ...style }} {...rest}>
      {children}
    </div>
  )
})
