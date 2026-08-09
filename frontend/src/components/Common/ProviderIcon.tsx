import React from 'react';
import { ProviderID } from '../../types/auth';

interface ProviderIconProps {
  providerId: ProviderID;
  className?: string;
}

export const ProviderIcon: React.FC<ProviderIconProps> = ({ providerId, className = 'w-12 h-12' }) => {
  switch (providerId) {
    case 'chatgpt':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.25 12.375a8.25 8.25 0 1 1-16.5 0 8.25 8.25 0 0 1 16.5 0Z" />
          <path d="M12 7.875v8.25" />
          <path d="M7.875 12h8.25" />
          <path d="m9.09 9.09 5.82 5.82" />
          <path d="m14.91 9.09-5.82 5.82" />
        </svg>
      );
    case 'claude':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="#d97757" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v20" />
          <path d="M2 12h20" />
          <path d="m4.93 4.93 14.14 14.14" />
          <path d="m19.07 4.93-14.14 14.14" />
          <circle cx="12" cy="12" r="3" fill="#d97757" />
        </svg>
      );
    case 'gemini':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="#4285f4">
          <path d="M12 2C12 7.5 7.5 12 2 12c5.5 0 10 4.5 10 10 0-5.5 4.5-10 10-10-5.5 0-10-4.5-10-10z" />
        </svg>
      );
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="4" />
          <path d="M12 8v8" />
          <path d="M8 12h8" />
        </svg>
      );
  }
};
