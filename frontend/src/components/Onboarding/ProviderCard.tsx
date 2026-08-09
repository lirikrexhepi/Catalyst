import React from 'react';
import { ProviderMeta } from '../../types/auth';
import { ProviderIcon } from '../Common/ProviderIcon';

interface ProviderCardProps {
  provider: ProviderMeta;
  isLinked: boolean;
  isAuthenticating: boolean;
  onConnect: (providerId: ProviderMeta['id']) => void;
}

export const ProviderCard: React.FC<ProviderCardProps> = ({
  provider,
  isLinked,
  isAuthenticating,
  onConnect,
}) => {
  return (
    <button
      type="button"
      onClick={() => !isLinked && !isAuthenticating && onConnect(provider.id)}
      disabled={isAuthenticating}
      className={`
        relative group flex flex-col items-center justify-center
        w-44 h-44 rounded-3xl transition-all duration-300 ease-out
        border outline-none cursor-pointer select-none
        ${
          isLinked
            ? 'bg-[#1c1c1c] border-emerald-500/60 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
            : 'bg-[#181818] border-neutral-800/80 hover:border-neutral-600 hover:bg-[#222222] hover:scale-[1.03] active:scale-[0.98]'
        }
      `}
    >
      {/* Background radial highlight */}
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-white/[0.04] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* Provider Icon */}
      <div className="relative z-10 flex items-center justify-center mb-3">
        {isAuthenticating ? (
          <div className="w-12 h-12 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        ) : (
          <ProviderIcon providerId={provider.id} className="w-16 h-16 text-neutral-300 group-hover:text-white transition-colors duration-200" />
        )}
      </div>

      {/* Status or Name badge */}
      <div className="relative z-10 text-center">
        {isLinked ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-800/40">
            ✓ Connected
          </span>
        ) : (
          <span className="text-sm font-medium text-neutral-400 group-hover:text-neutral-200 transition-colors">
            {provider.name}
          </span>
        )}
      </div>
    </button>
  );
};
