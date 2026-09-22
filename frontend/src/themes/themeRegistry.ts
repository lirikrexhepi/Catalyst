import { ThemeDefinition } from './types';

export const DARK_THEME: ThemeDefinition = {
  id: 'dark',
  name: 'Dark',
  description: 'Pure neutral obsidian with true blacks.',
  previewGradient: 'linear-gradient(135deg, #030303 0%, #0a0a0a 50%, #121212 100%)',
  colors: {
    panelBackground: 'rgba(3, 3, 3, 0.94)',
    panelBorder: 'rgba(255, 255, 255, 0.08)',
    cardBackground: 'rgba(18, 18, 18, 0.90)',
    cardBorder: 'rgba(255, 255, 255, 0.07)',
    inputBackground: 'rgba(10, 10, 10, 0.96)',
    inputBorder: 'rgba(255, 255, 255, 0.08)',
    pillBackground: 'rgba(255, 255, 255, 0.06)',
    pillHover: 'rgba(255, 255, 255, 0.12)',
    divider: 'rgba(255, 255, 255, 0.08)',
    textPrimary: '#ffffff',
    textSecondary: 'rgba(255, 255, 255, 0.70)',
    textMuted: 'rgba(255, 255, 255, 0.40)',
    accent: '#ffffff',
  },
  glass: {
    mode: 'stealth',
    frost: 0,
    frostSaturation: 100,
    specularOpacity: 0,
    shadow:
      '0 24px 60px rgba(0, 0, 0, 0.65), 0 4px 16px rgba(0, 0, 0, 0.4), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.18)',
  },
  cssVariables: {
    '--theme-panel-bg': 'rgba(3, 3, 3, 0.94)',
    '--theme-panel-border': 'rgba(255, 255, 255, 0.08)',
    '--theme-card-bg': 'rgba(18, 18, 18, 0.90)',
    '--theme-card-border': 'rgba(255, 255, 255, 0.07)',
    '--theme-input-bg': 'rgba(10, 10, 10, 0.96)',
    '--theme-input-border': 'rgba(255, 255, 255, 0.08)',
    '--theme-pill-bg': 'rgba(255, 255, 255, 0.06)',
    '--theme-pill-hover': 'rgba(255, 255, 255, 0.12)',
    '--theme-divider': 'rgba(255, 255, 255, 0.08)',
    '--theme-text-primary': '#ffffff',
    '--theme-text-secondary': 'rgba(255, 255, 255, 0.70)',
    '--theme-text-muted': 'rgba(255, 255, 255, 0.40)',
  },
};

export const LIGHT_THEME: ThemeDefinition = {
  id: 'light',
  name: 'Light',
  description: 'Pure clean white glass counterpart to dark.',
  previewGradient: 'linear-gradient(135deg, #ffffff 0%, #f5f5f7 50%, #eaeaea 100%)',
  colors: {
    panelBackground: 'rgba(255, 255, 255, 0.92)',
    panelBorder: 'rgba(0, 0, 0, 0.08)',
    cardBackground: 'rgba(240, 240, 242, 0.92)',
    cardBorder: 'rgba(0, 0, 0, 0.08)',
    inputBackground: 'rgba(255, 255, 255, 0.96)',
    inputBorder: 'rgba(0, 0, 0, 0.08)',
    pillBackground: 'rgba(0, 0, 0, 0.05)',
    pillHover: 'rgba(0, 0, 0, 0.09)',
    divider: 'rgba(0, 0, 0, 0.08)',
    textPrimary: '#030303',
    textSecondary: 'rgba(3, 3, 3, 0.70)',
    textMuted: 'rgba(3, 3, 3, 0.45)',
    accent: '#030303',
  },
  glass: {
    mode: 'stealth',
    frost: 0,
    frostSaturation: 100,
    specularOpacity: 0,
    shadow:
      '0 20px 48px rgba(0, 0, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.06), inset 0 0.5px 0.5px rgba(255, 255, 255, 0.8)',
  },
  cssVariables: {
    '--theme-panel-bg': 'rgba(255, 255, 255, 0.92)',
    '--theme-panel-border': 'rgba(0, 0, 0, 0.08)',
    '--theme-card-bg': 'rgba(240, 240, 242, 0.92)',
    '--theme-card-border': 'rgba(0, 0, 0, 0.08)',
    '--theme-input-bg': 'rgba(255, 255, 255, 0.96)',
    '--theme-input-border': 'rgba(0, 0, 0, 0.08)',
    '--theme-pill-bg': 'rgba(0, 0, 0, 0.05)',
    '--theme-pill-hover': 'rgba(0, 0, 0, 0.09)',
    '--theme-divider': 'rgba(0, 0, 0, 0.08)',
    '--theme-text-primary': '#030303',
    '--theme-text-secondary': 'rgba(3, 3, 3, 0.70)',
    '--theme-text-muted': 'rgba(3, 3, 3, 0.45)',
  },
};

export const GLASS_THEME: ThemeDefinition = {
  id: 'glass',
  name: 'Glass',
  description: 'Physical glass lens refraction with chromatic aberration dispersion.',
  previewGradient: 'linear-gradient(135deg, rgba(255, 0, 128, 0.35) 0%, rgba(0, 255, 200, 0.25) 50%, rgba(0, 128, 255, 0.4) 100%)',
  colors: {
    panelBackground: 'rgba(10, 14, 26, 0.38)',
    panelBorder: 'rgba(255, 255, 255, 0.25)',
    cardBackground: 'rgba(255, 255, 255, 0.07)',
    cardBorder: 'rgba(255, 255, 255, 0.15)',
    inputBackground: 'rgba(0, 0, 0, 0.18)',
    inputBorder: 'rgba(255, 255, 255, 0.28)',
    pillBackground: 'rgba(255, 255, 255, 0.12)',
    pillHover: 'rgba(255, 255, 255, 0.20)',
    divider: 'rgba(255, 255, 255, 0.18)',
    textPrimary: '#ffffff',
    textSecondary: 'rgba(255, 255, 255, 0.85)',
    textMuted: 'rgba(255, 255, 255, 0.55)',
    accent: '#818cf8',
  },
  glass: {
    mode: 'optical-refraction',
    frost: 16,
    frostSaturation: 160,
    specularOpacity: 0.75,
    shadow:
      '0 24px 64px rgba(0, 0, 0, 0.45), inset 0 1px 1.5px rgba(255, 255, 255, 0.4), inset 0 -1px 1px rgba(0, 0, 0, 0.2)',
    refraction: {
      distortionScale: -180,
      redOffset: 0,
      greenOffset: 10,
      blueOffset: 20,
      blur: 7,
      displace: 0.5,
      brightness: 50,
      opacity: 0.93,
      backgroundOpacity: 0.18,
      saturation: 1.5,
      mixBlendMode: 'screen',
    },
  },
  cssVariables: {
    '--theme-panel-bg': 'rgba(10, 14, 26, 0.38)',
    '--theme-panel-border': 'rgba(255, 255, 255, 0.25)',
    '--theme-card-bg': 'rgba(255, 255, 255, 0.07)',
    '--theme-card-border': 'rgba(255, 255, 255, 0.15)',
    '--theme-input-bg': 'rgba(0, 0, 0, 0.18)',
    '--theme-input-border': 'rgba(255, 255, 255, 0.28)',
    '--theme-pill-bg': 'rgba(255, 255, 255, 0.12)',
    '--theme-pill-hover': 'rgba(255, 255, 255, 0.20)',
    '--theme-divider': 'rgba(255, 255, 255, 0.18)',
    '--theme-text-primary': '#ffffff',
    '--theme-text-secondary': 'rgba(255, 255, 255, 0.85)',
    '--theme-text-muted': 'rgba(255, 255, 255, 0.55)',
  },
};

export const STEALTH_DARK_THEME = DARK_THEME;
export const REFRACTIVE_GLASS_THEME = GLASS_THEME;

const registeredThemes: Map<string, ThemeDefinition> = new Map([
  [DARK_THEME.id, DARK_THEME],
  [LIGHT_THEME.id, LIGHT_THEME],
  [GLASS_THEME.id, GLASS_THEME],
]);

export function getRegisteredTheme(id: string): ThemeDefinition {
  if (id === 'dark-stealth') return DARK_THEME;
  if (id === 'refractive-glass') return GLASS_THEME;
  if (id === 'white') return LIGHT_THEME;
  return registeredThemes.get(id) || DARK_THEME;
}

export function getAllThemes(): ThemeDefinition[] {
  return [DARK_THEME, LIGHT_THEME, GLASS_THEME];
}

export function registerTheme(theme: ThemeDefinition): void {
  registeredThemes.set(theme.id, theme);
}

export function unregisterTheme(id: string): boolean {
  if (id === DARK_THEME.id || id === LIGHT_THEME.id || id === GLASS_THEME.id) {
    return false;
  }
  return registeredThemes.delete(id);
}
