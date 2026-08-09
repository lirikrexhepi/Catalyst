import React from 'react';

export const Header: React.FC = () => {
  return (
    <div className="text-left mb-16 select-none">
      <h1 className="text-4xl font-bold tracking-tight text-white mb-2">
        Welcome to Catalyst
      </h1>
      <p className="text-lg text-neutral-400 font-normal">
        Get started by linking any of the providers below.
      </p>
    </div>
  );
};
