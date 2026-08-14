import React, { forwardRef } from 'react';

export interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  maxHeight?: number | string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Reusable minimalistic scroll container with modern arrowless glass scrollbars.
 */
export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ maxHeight, className = '', style = {}, children, ...rest }, ref) => {
    return (
      <div
        ref={ref}
        className={`modern-scroll-area overflow-y-auto overflow-x-hidden ${className}`}
        style={{
          maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
          ...style,
        }}
        {...rest}
      >
        {children}
      </div>
    );
  }
);

ScrollArea.displayName = 'ScrollArea';
export default ScrollArea;
