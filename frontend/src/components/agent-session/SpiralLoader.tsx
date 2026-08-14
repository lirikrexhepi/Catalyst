import React from 'react';

export interface SpiralLoaderProps {
  className?: string;
  size?: number;
}

/**
 * SpiralLoader matching agent-elements.21st.dev/docs/spiral-loader
 * Single stroke organic spiral curve with continuous rotating animation.
 */
export const SpiralLoader: React.FC<SpiralLoaderProps> = ({
  className = '',
  size = 16,
}) => {
  return (
    <div
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="animate-spin"
        style={{
          animationDuration: '1.2s',
          animationTimingFunction: 'linear',
        }}
      >
        {/* Exact smooth continuous spiral trajectory */}
        <path
          d="M12 12C12 10.8954 12.8954 10 14 10C15.6569 10 17 11.3431 17 13C17 15.2091 15.2091 17 13 17C10.2386 17 8 14.7614 8 12C8 8.68629 10.6863 6 14 6C17.866 6 21 9.13401 21 13"
          stroke="currentColor"
          strokeWidth="1.85"
          strokeLinecap="round"
          className="opacity-95"
        />
      </svg>
    </div>
  );
};

export default SpiralLoader;
