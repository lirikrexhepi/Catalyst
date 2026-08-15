import React from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface MarkdownTextProps {
  content: string;
  className?: string;
}

/**
 * Renders agent output as markdown. Agents emit bold, inline code, lists and
 * fenced blocks constantly, so raw text reads as noise without this.
 *
 * Element renderers are declared once at module scope: react-markdown remounts
 * the tree whenever the components object identity changes, which would restart
 * every animation on each streamed token.
 */
const COMPONENTS: Components = {
  p: ({ children }) => <p className="my-0 leading-relaxed">{children}</p>,

  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="italic text-white/85">{children}</em>,

  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-sky-300/90 hover:text-sky-200 underline underline-offset-2 decoration-white/25"
    >
      {children}
    </a>
  ),

  ul: ({ children }) => <ul className="my-1 pl-4 list-disc marker:text-white/35">{children}</ul>,
  ol: ({ children }) => <ol className="my-1 pl-4 list-decimal marker:text-white/35">{children}</ol>,
  li: ({ children }) => <li className="my-0.5 leading-relaxed">{children}</li>,

  h1: ({ children }) => <h1 className="text-[12.5px] font-semibold text-white mt-3 mb-1">{children}</h1>,
  h2: ({ children }) => <h2 className="text-[12.5px] font-semibold text-white mt-3 mb-1">{children}</h2>,
  h3: ({ children }) => <h3 className="text-[12px] font-semibold text-white/95 mt-2.5 mb-1">{children}</h3>,

  blockquote: ({ children }) => (
    <blockquote className="my-1 pl-2.5 border-l-2 border-white/20 text-white/70">{children}</blockquote>
  ),

  hr: () => <hr className="my-2 border-white/15" />,

  code: ({ className, children, ...props }) => {
    // Fenced blocks carry a language class; bare inline code does not.
    const isBlock = Boolean(className?.startsWith('language-'));
    if (!isBlock) {
      return (
        <code
          className="px-1 py-[1px] rounded-[4px] bg-white/12 border border-white/10 font-mono text-[11px] text-white/95"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className="block font-mono text-[11px] leading-relaxed text-white/90" {...props}>
        {children}
      </code>
    );
  },

  pre: ({ children }) => (
    <pre className="my-1.5 px-3 py-2 rounded-[9px] bg-black/30 border border-white/10 overflow-x-auto modern-scroll-area">
      {children}
    </pre>
  ),

  table: ({ children }) => (
    <div className="my-1.5 overflow-x-auto modern-scroll-area">
      <table className="w-full border-collapse text-[11px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-white/15 px-2 py-1 text-left font-semibold text-white/90">{children}</th>
  ),
  td: ({ children }) => <td className="border border-white/12 px-2 py-1 text-white/80">{children}</td>,
};

const PLUGINS = [remarkGfm];

const MarkdownTextImpl: React.FC<MarkdownTextProps> = ({ content, className = '' }) => (
  <div className={`markdown-body ${className}`}>
    <ReactMarkdown remarkPlugins={PLUGINS} components={COMPONENTS}>
      {content}
    </ReactMarkdown>
  </div>
);

export const MarkdownText = React.memo(MarkdownTextImpl);
MarkdownText.displayName = 'MarkdownText';

export default MarkdownText;
