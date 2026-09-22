import React, { useState, useCallback } from 'react';

export interface MessageTimestampProps {
  timestamp?: number;
  content?: string;
  className?: string;
  align?: 'left' | 'right';
}

/**
 * Formats a message timestamp matching Cursor / Composer style:
 * e.g. "Sep 18 at 10:03 PM" (or with year if different year).
 */
export function formatMessageTime(timestamp?: number | string | Date): string {
  if (!timestamp) return '';
  const date = typeof timestamp === 'number' || typeof timestamp === 'string'
    ? new Date(timestamp)
    : timestamp;
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const isSameYear = date.getFullYear() === now.getFullYear();

  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const day = date.getDate();
  const time = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (isSameYear) {
    return `${month} ${day} at ${time}`;
  }
  return `${month} ${day}, ${date.getFullYear()} at ${time}`;
}

/**
 * MessageTimestamp Component
 * Clean, subtle message timestamp and copy action matching Cursor/Composer.
 */
export const MessageTimestamp: React.FC<MessageTimestampProps> = ({
  timestamp,
  content,
  className = '',
  align = 'left',
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [content]);

  if (!timestamp) return null;

  const formattedTime = formatMessageTime(timestamp);
  if (!formattedTime) return null;

  const fullDateTitle = new Date(timestamp).toLocaleString();

  return (
    <div
      className={`flex items-center gap-1.5 pt-1.5 text-[11px] font-['Geist'] text-white/40 select-none ${
        align === 'right' ? 'justify-end' : 'justify-start'
      } ${className}`}
    >
      <span
        title={fullDateTitle}
        className="tracking-tight hover:text-white/60 transition-colors"
      >
        {formattedTime}
      </span>
      {content && (
        <button
          type="button"
          title={copied ? 'Copied!' : 'Copy message'}
          onClick={handleCopy}
          className="w-[18px] h-[18px] rounded flex items-center justify-center text-white/35 hover:text-white/90 hover:bg-white/10 active:scale-90 transition-all cursor-pointer"
        >
          <span className="material-symbols-outlined text-[13px] leading-none">
            {copied ? 'check' : 'content_copy'}
          </span>
        </button>
      )}
    </div>
  );
};

export default MessageTimestamp;
