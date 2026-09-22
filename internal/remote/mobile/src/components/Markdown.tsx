import React from 'react'
import ReactMarkdown, { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

const COMPONENTS: Components = {
  p: ({ children }) => <p style={{ margin: '6px 0', lineHeight: 1.6 }}>{children}</p>,
  strong: ({ children }) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline', overflowWrap: 'anywhere' }}>
      {children}
    </a>
  ),
  ul: ({ children }) => <ul style={{ margin: '6px 0', paddingLeft: 20, listStyle: 'disc' }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ margin: '6px 0', paddingLeft: 20, listStyle: 'decimal' }}>{children}</ol>,
  li: ({ children }) => <li style={{ margin: '3px 0', lineHeight: 1.55 }}>{children}</li>,
  h1: ({ children }) => <div style={{ fontSize: 17, fontWeight: 800, margin: '10px 0 6px' }}>{children}</div>,
  h2: ({ children }) => <div style={{ fontSize: 16, fontWeight: 800, margin: '9px 0 5px' }}>{children}</div>,
  h3: ({ children }) => <div style={{ fontSize: 15, fontWeight: 700, margin: '8px 0 4px' }}>{children}</div>,
  h4: ({ children }) => <div style={{ fontSize: 14, fontWeight: 700, margin: '7px 0 4px' }}>{children}</div>,
  blockquote: ({ children }) => (
    <div style={{ margin: '6px 0', paddingLeft: 10, borderLeft: '2px solid rgba(255,255,255,0.25)', color: 'var(--text-sec)' }}>
      {children}
    </div>
  ),
  hr: () => <hr style={{ margin: '10px 0', border: 'none', borderTop: '0.5px solid var(--border-div)' }} />,
  code: ({ className, children }) => {
    const isBlock = Boolean(className?.startsWith('language-'))
    if (!isBlock) {
      return (
        <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.85em', background: 'rgba(255,255,255,0.09)', borderRadius: 5, padding: '1px 5px', overflowWrap: 'anywhere' }}>
          {children}
        </code>
      )
    }
    return (
      <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, lineHeight: 1.55 }}>
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre style={{
      margin: '8px 0',
      padding: '10px 12px',
      borderRadius: 12,
      background: 'rgba(0,0,0,0.45)',
      border: '0.5px solid var(--border-div)',
      fontSize: 12.5,
      lineHeight: 1.55,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
      overflowWrap: 'anywhere',
      maxWidth: '100%',
    }}>
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12.5, width: '100%' }}>{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th style={{ border: '0.5px solid var(--border-div)', padding: '5px 8px', textAlign: 'left', fontWeight: 700 }}>{children}</th>
  ),
  td: ({ children }) => (
    <td style={{ border: '0.5px solid var(--border-div)', padding: '5px 8px', overflowWrap: 'anywhere' }}>{children}</td>
  ),
}

export default function Markdown({ content }: { content: string }) {
  return (
    <div style={{ overflowWrap: 'anywhere', wordBreak: 'break-word', maxWidth: '100%', minWidth: 0 }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
