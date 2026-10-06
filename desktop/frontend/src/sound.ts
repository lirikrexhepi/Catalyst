import { bind, play, setEnabled } from 'cuelume';

let bound = false;
let lastTaskCompleteAt = 0;

export function initSounds(enabled: boolean): void {
  if (!bound) {
    bound = true;
    try {
      bind();
    } catch {
      /* non-browser or missing Web Audio: stay silent */
    }
  }
  setSoundsEnabled(enabled);
}

export function setSoundsEnabled(enabled: boolean): void {
  try {
    setEnabled(enabled);
  } catch {
    /* non-browser or missing Web Audio: stay silent */
  }
}

export function playTaskComplete(): void {
  const now = Date.now();
  if (now - lastTaskCompleteAt < 1500) return;
  lastTaskCompleteAt = now;
  try {
    play('success');
  } catch {
    /* blocked autoplay or missing Web Audio: stay silent */
  }
}
