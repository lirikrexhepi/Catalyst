import React from 'react';
import { Check, Copy, Loader2, Smartphone } from 'lucide-react';
import { useRemoteAccess } from './useRemoteAccess';
import { useTheme } from '../../themes';

export const RemoteAccessSection: React.FC = () => {
  const { currentTheme } = useTheme();
  const isLight = currentTheme.id === 'light' || currentTheme.id === 'white';
  const { info, loading, copied, toggle, regenerate, copyUrl } = useRemoteAccess(true);

  const isLive = Boolean(info?.enabled);
  const isConnecting = isLive && (info?.connecting || info?.downloading || !info?.bestUrl);
  const muted = isLight ? 'text-black/45' : 'text-white/45';
  const strong = isLight ? 'text-[#030303]' : 'text-white';

  return (
    <div className={`flex flex-col gap-2.5 pt-3 border-t ${isLight ? 'border-black/[0.06]' : 'border-white/[0.06]'}`}>
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2">
          <Smartphone size={16} strokeWidth={1.75} className={isLive ? 'text-[#38bdf8]' : muted} />
          <span className={`text-[12px] font-medium font-['Geist'] tracking-tight ${strong}`}>Phone access</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isLive}
          aria-label="Phone access"
          disabled={loading}
          onClick={() => void toggle(!isLive)}
          className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 ease-out cursor-pointer shrink-0 ${
            isLive ? (isLight ? 'bg-[#007AFF]' : 'bg-[#38bdf8]') : isLight ? 'bg-black/15' : 'bg-white/15'
          } ${loading ? 'opacity-50' : ''}`}
        >
          <div
            className={`w-4 h-4 rounded-full transition-transform duration-200 ease-out shadow-sm ${
              isLive ? `translate-x-4 ${isLight ? 'bg-white' : 'bg-black'}` : `translate-x-0 ${isLight ? 'bg-white' : 'bg-white/60'}`
            }`}
          />
        </button>
      </div>

      {isLive && info && (
        info.error ? (
          <div className="flex items-center justify-between gap-3 px-0.5">
            <span className="text-[11px] text-red-300 truncate" title={info.error}>Couldn't connect</span>
            <button type="button" onClick={() => void toggle(true)} className={`text-[11px] font-medium cursor-pointer ${strong}`}>
              Retry
            </button>
          </div>
        ) : isConnecting ? (
          <div className={`flex items-center gap-2 px-0.5 text-[11px] ${muted}`}>
            <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
            Connecting…
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {info.qrCodeSvg ? (
              <img src={info.qrCodeSvg} alt="Scan to pair your phone" className="w-[92px] h-[92px] p-1.5 bg-white rounded-[12px] shrink-0 object-contain" />
            ) : (
              <div className={`w-[92px] h-[92px] rounded-[12px] shrink-0 ${isLight ? 'bg-black/[0.05]' : 'bg-white/[0.06]'}`} />
            )}
            <div className="flex flex-col gap-2 min-w-0">
              <span className={`flex items-center gap-1.5 text-[11px] ${muted}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                {info.activeClients > 0 ? `${info.activeClients} connected` : 'Scan with your phone'}
              </span>
              <button
                type="button"
                onClick={copyUrl}
                title={info.bestUrl}
                className={`self-start flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] font-medium cursor-pointer transition-colors ${
                  isLight ? 'bg-black/[0.06] hover:bg-black/[0.1] text-[#030303]' : 'bg-white/[0.08] hover:bg-white/[0.14] text-white'
                }`}
              >
                {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.75} />}
                {copied ? 'Copied' : 'Copy link'}
              </button>
              <button type="button" onClick={() => void regenerate()} className={`self-start text-[10px] cursor-pointer hover:text-[#f87171] ${muted}`}>
                New code
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
};
