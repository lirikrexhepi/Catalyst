export type ThemeType = 'dark' | 'light' | 'glass' | 'dark-stealth' | 'refractive-glass' | 'custom';

export interface ThemeColors {
  /** Main panel/window surface background */
  panelBackground: string;
  /** Border color for panels and windows */
  panelBorder: string;
  /** Background for cards, tool blocks, chat bubbles */
  cardBackground: string;
  /** Border for cards and feed blocks */
  cardBorder: string;
  /** Composer / message input container background */
  inputBackground: string;
  /** Input border */
  inputBorder: string;
  /** Background for button pills and badges */
  pillBackground: string;
  /** Hover background for button pills */
  pillHover: string;
  /** Divider color */
  divider: string;
  /** Primary text color */
  textPrimary: string;
  /** Secondary/subtle text color */
  textSecondary: string;
  /** Muted text / placeholder */
  textMuted: string;
  /** Accent highlight */
  accent: string;
}

export interface ThemeGlassSettings {
  /** Whether this theme uses standard dark glass or ShuttleTV-style optical refraction */
  mode: 'stealth' | 'optical-refraction';
  frost: number;
  frostSaturation: number;
  specularOpacity: number;
  shadow: string;
  /** Specific options if using optical refraction */
  refraction?: {
    distortionScale: number;
    redOffset: number;
    greenOffset: number;
    blueOffset: number;
    blur: number;
    displace: number;
    brightness: number;
    opacity: number;
    backgroundOpacity: number;
    saturation: number;
    mixBlendMode: string;
  };
}

export interface ThemeDefinition {
  /** Unique theme identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** One-line description */
  description: string;
  /** Author name / handle */
  author?: string;
  /** Version tag */
  version?: string;
  /** Preview color gradient or swatch for settings & marketplace UI */
  previewGradient: string;
  /** Theme colors */
  colors: ThemeColors;
  /** Glass optics and blur characteristics */
  glass: ThemeGlassSettings;
  /** Custom CSS variables mapped to :root */
  cssVariables?: Record<string, string>;
}

export interface ThemeContextValue {
  currentTheme: ThemeDefinition;
  themeId: string;
  availableThemes: ThemeDefinition[];
  setTheme: (id: string) => void;
  registerTheme: (theme: ThemeDefinition) => void;
}

