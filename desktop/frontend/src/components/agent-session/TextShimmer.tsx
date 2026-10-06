import React from 'react';

export interface TextShimmerProps {
  children: React.ReactNode;
  as?: React.ElementType;
  className?: string;
  duration?: number;
  spread?: number;
}

/**
 * TextShimmer component from agent-elements spec
 * Creates an animated luminous shimmer traveling across text.
 */
export const TextShimmer: React.FC<TextShimmerProps> = ({
  children,
  as: Component = 'span',
  className = '',
  duration = 1.6,
  spread = 100,
}) => {
  const shimmerText = typeof children === 'string' ? children : undefined;

  return (
    <Component
      className={`an-text-shimmer ${className}`}
      data-shimmer-text={shimmerText}
      style={
        {
          '--shimmer-duration': `${duration}s`,
          '--shimmer-spread': `${spread * 2}%`,
        } as React.CSSProperties
      }
    >
      {children}
    </Component>
  );
};

export default TextShimmer;
