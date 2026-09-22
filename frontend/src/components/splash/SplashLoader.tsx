import React, { useEffect, useState } from 'react';
import splashEyesUrl from '../../assets/logo/splash-eyes.png';

const SPLASH_SETTING_KEY = 'orchestrator_splash_enabled';

export function isSplashEnabled(): boolean {
  try {
    const val = localStorage.getItem(SPLASH_SETTING_KEY);
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
}

export function setSplashEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SPLASH_SETTING_KEY, String(enabled));
  } catch {
    // ignore
  }
}

interface SplashLoaderProps {
  onComplete: () => void;
}

/**
 * 1-second startup splash:
 * 1. Black curtain slides from bottom to top with fluid cubic-bezier(0.16, 1, 0.3, 1) easing (~350ms).
 * 2. Eyes blink open in center (~160ms).
 * 3. Gaze hold (~280ms).
 * 4. Eyes blink shut (~130ms).
 * 5. Screen fades cleanly into the workspace (~180ms).
 *
 * Self-contained: can be completely removed from App.tsx in 1 line.
 */
export const SplashLoader: React.FC<SplashLoaderProps> = ({ onComplete }) => {
  const [stage, setStage] = useState<'rising' | 'eyes-open' | 'eyes-shut' | 'fadeout' | 'done'>('rising');

  useEffect(() => {
    // 0ms: Rising curtain starts
    // 420ms: Curtain covers screen -> Eyes blink open
    const t1 = setTimeout(() => setStage('eyes-open'), 420);
    // 1020ms: Eyes gaze hold (~420ms) then blink shut
    const t2 = setTimeout(() => setStage('eyes-shut'), 1020);
    // 1180ms: Curtain fades out
    const t3 = setTimeout(() => setStage('fadeout'), 1180);
    // 1400ms: Sequence complete (+300ms slower total), unmount
    const t4 = setTimeout(() => {
      setStage('done');
      onComplete();
    }, 1400);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [onComplete]);

  if (stage === 'done') return null;

  return (
    <div
      className="fixed inset-0 z-[9999] pointer-events-auto select-none overflow-hidden"
      style={{
        opacity: stage === 'fadeout' ? 0 : 1,
        transition: 'opacity 220ms ease-out',
      }}
      onClick={onComplete}
    >
      {/* Black Shutter Curtain with fluid cubic-bezier easing */}
      <div className="absolute inset-0 bg-black anim-curtain-rise flex items-center justify-center">
        {/* Centered Eyes - enlarged from 180px to 270px */}
        {(stage === 'eyes-open' || stage === 'eyes-shut') && (
          <div
            className={`w-[270px] h-[270px] flex items-center justify-center ${
              stage === 'eyes-open' ? 'anim-eyes-open' : 'anim-eyes-shut'
            }`}
          >
            <img
              src={splashEyesUrl}
              alt="Orchestrator Eyes"
              draggable={false}
              className="w-full h-full object-contain filter drop-shadow-[0_0_36px_rgba(255,255,255,0.22)]"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default SplashLoader;
