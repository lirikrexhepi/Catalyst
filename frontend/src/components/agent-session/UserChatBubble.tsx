import React from 'react';

export interface UserChatBubbleProps {
  message: string;
  className?: string;
}

/**
 * UserChatBubble Component
 * Luminous frosted glass chat bubble for user messages in the session feed.
 */
const UserChatBubbleImpl: React.FC<UserChatBubbleProps> = ({
  message,
  className = '',
}) => {
  return (
    <div
      className={`self-end max-w-[80%] rounded-[14px] glass-card border border-white/25 px-4 py-2.5 text-[12px] font-['Geist'] text-white shadow-md leading-relaxed select-text font-medium ${className}`}
      style={{
        boxShadow:
          '0 4px 16px rgba(0, 0, 0, 0.2), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.35)',
      }}
    >
      {message}
    </div>
  );
};

export const UserChatBubble = React.memo(UserChatBubbleImpl);
UserChatBubble.displayName = 'UserChatBubble';

export default UserChatBubble;
