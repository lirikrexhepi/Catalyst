import blueSimplistic from './assets/logo/app-icons/blue-simplistic.png';
import blueBase from './assets/logo/app-icons/blue-base.png';
import blueComplex from './assets/logo/app-icons/blue-complex.png';
import purpleSimplistic from './assets/logo/app-icons/purple-simplistic.png';
import purpleBase from './assets/logo/app-icons/purple-base.png';
import purpleComplex from './assets/logo/app-icons/purple-complex.png';

export interface AppIcon {
  id: string;
  label: string;
  src: string;
}

export const APP_ICONS: AppIcon[] = [
  { id: 'blue-simplistic', label: 'Blue Single', src: blueSimplistic },
  { id: 'blue-base', label: 'Blue Stack', src: blueBase },
  { id: 'blue-complex', label: 'Blue Orbit', src: blueComplex },
  { id: 'purple-simplistic', label: 'Purple Single', src: purpleSimplistic },
  { id: 'purple-base', label: 'Purple Stack', src: purpleBase },
  { id: 'purple-complex', label: 'Purple Orbit', src: purpleComplex },
];

export const DEFAULT_APP_ICON = 'blue-base';

export function appIconSrc(id: string): string {
  return (APP_ICONS.find((icon) => icon.id === id) ?? APP_ICONS[1]).src;
}
