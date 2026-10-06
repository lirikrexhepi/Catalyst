import React from 'react';

export interface OrbitLoaderProps {
  className?: string;
  size?: number;
}

export const OrbitLoader: React.FC<OrbitLoaderProps> = ({
  className = '',
  size = 16,
}) => {
  return (
    <span
      className={`an-orbit ${className}`}
      style={{ width: `${size}px`, height: `${size}px` }}
      aria-hidden
    >
      <span className="an-orbit-ring" />
      <span className="an-orbit-arm">
        <span className="an-orbit-sat" />
      </span>
      <span className="an-orbit-core" />
    </span>
  );
};

export default OrbitLoader;
