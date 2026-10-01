import { useCallback, useEffect, useRef, useState } from 'react'
import { ChatFrame } from '../components/chrome/ChatFrame'
import { VirtualFeed, type VirtualFeedHandle } from '../feed/VirtualFeed'
import type { AgentStreamBlock } from '../feed/types'

function makeBlocks(n: number): AgentStreamBlock[] {
  const out: AgentStreamBlock[] = []
  for (let i = 0; i < n; i++) {
    if (i % 3 === 0) out.push({ type: 'user', id: `u${i}`, content: `Question number ${i}: can you check the railing layout again?` } as AgentStreamBlock)
    else if (i % 3 === 1)
      out.push({
        type: 'tool_group',
        id: `g${i}`,
        title: 'Worked',
        items: [
          { id: `a${i}`, type: 'read', action: 'Read', target: `src/features/file${i}.ts`, status: 'completed' },
          { id: `b${i}`, type: 'bash', action: 'Ran', target: 'npm test', status: 'completed', details: 'ok' },
        ],
      } as AgentStreamBlock)
    else
      out.push({
        type: 'text',
        id: `t${i}`,
        content: `Answer ${i}. ` + 'The railing posts now snap to the slab edge and keep a 120 mm spacing. '.repeat(1 + (i % 5)),
      } as AgentStreamBlock)
  }
  return out
}

export function LongFeedLab() {
  const [blocks, setBlocks] = useState(() => makeBlocks(600))
  const [pinned, setPinned] = useState(true)
  const feed = useRef<VirtualFeedHandle | null>(null)
  const onPinned = useCallback((p: boolean) => setPinned(p), [])
  useEffect(() => {
    ;(window as unknown as { addBlock: () => void }).addBlock = () =>
      setBlocks((b) => [...b, { type: 'text', id: `n${b.length}`, content: `Streamed reply ${b.length}` } as AgentStreamBlock])
  }, [])
  return (
    <div className="screen" style={{ position: 'absolute', inset: 0 }}>
      <ChatFrame
        header={<div style={{ height: 60 }} />}
        dock={<div style={{ height: 80 }} />}
        floating={pinned ? null : <button className="jump chat-jump" onClick={() => feed.current?.jump()}>↓</button>}
        list={(insets) => (
          <VirtualFeed ref={feed} threadId="long" blocks={blocks} turnMs={{}} insetTop={insets.top} insetBottom={insets.bottom} onPinnedChange={onPinned} />
        )}
      />
    </div>
  )
}
