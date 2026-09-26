import { forwardRef, useRef, type CSSProperties, type ReactNode, type UIEventHandler } from 'react'
import { useElementSize } from '../../ui/geometry/useElementSize'

interface ChatFrameProps {
  header: ReactNode
  dock: ReactNode
  floating?: ReactNode
  onScroll?: UIEventHandler<HTMLDivElement>
  children: ReactNode
}

export const ChatFrame = forwardRef<HTMLDivElement, ChatFrameProps>(function ChatFrame({ header, dock, floating, onScroll, children }, scrollRef) {
  const head = useRef<HTMLDivElement | null>(null)
  const foot = useRef<HTMLDivElement | null>(null)
  const headSize = useElementSize(head)
  const footSize = useElementSize(foot)
  const vars = {
    '--head-h': `${headSize?.height ?? 0}px`,
    '--dock-h': `${footSize?.height ?? 0}px`,
  } as CSSProperties

  return (
    <div className="chat-frame" style={vars}>
      <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
        {children}
      </div>
      <div className="chat-head" ref={head}>
        {header}
      </div>
      {floating}
      <div className="chat-dock" ref={foot}>
        {dock}
      </div>
    </div>
  )
})
