export type LiquidGlassSurface = 'squircle' | 'circle' | 'concave' | 'lip';

export type LiquidGlassShadow = 'none' | 'subtle' | 'apple' | 'elevated' | 'dramatic' | string;

export type LiquidGlassVariant = 'panel' | 'capsule' | 'button' | 'toolbar' | 'card' | 'input' | 'raw';

export interface RefractionEngineOptions {
  /**
   * Refractive index of the glass material.
   * Default: 1.5 (standard optical glass/acrylic)
   */
  glassRefractiveIndex?: number;
  /**
   * Refractive index of the ambient medium.
   * Default: 1.0 (air)
   */
  ambientRefractiveIndex?: number;
  /**
   * Surface profile curvature formula.
   * Default: 'squircle' (Apple's continuous 4th-order bezel)
   */
  surface?: LiquidGlassSurface;
  /**
   * Width of the curved bezel edge in pixels.
   * Default: 24
   */
  bezelWidth?: number;
  /**
   * Virtual thickness of the glass in pixels.
   * Default: 40
   */
  glassThickness?: number;
  /**
   * Flat base thickness beneath the curved bezel in pixels.
   * Default: 5
   */
  baseThickness?: number;
  /**
   * Light incidence direction angle in degrees for specular highlights (-180 to 180).
   * Default: -60 (top-left angled illumination)
   */
  lightAngle?: number;
  /**
   * Elevation angle of light source in degrees (0 to 90).
   * Default: 45
   */
  lightElevation?: number;
}

export interface DisplacementMapResult {
  specularMapUrl: string;
  maxDisplacement: number;
  width: number;
  height: number;
  radius: number;
  bezelWidth: number;
}

export interface LiquidGlassProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: LiquidGlassVariant;
  surface?: LiquidGlassSurface;
  radius?: number | 'full';
  bezelWidth?: number;
  glassThickness?: number;
  baseThickness?: number;
  refractionScale?: number;
  /**
   * Defocus applied inside the refraction graph, in pixels. Kept small: this only
   * softens the ray-displaced edge optics.
   */
  blur?: number;
  /**
   * Frosting applied to the whole backdrop, in pixels. This is what makes text behind
   * the surface unreadable while large shapes stay recognizable. Distinct from `blur`,
   * which only defocuses the refracted bezel.
   */
  frost?: number;
  /**
   * Backdrop saturation multiplier applied alongside the frost.
   */
  frostSaturation?: number;
  specularOpacity?: number;
  specularSaturation?: number;
  lightAngle?: number;
  lightElevation?: number;
  tint?: string;
  darkTint?: string;
  border?: boolean | string;
  shadow?: LiquidGlassShadow;
  interactive?: boolean;
  chromaticAberration?: boolean;
  /**
   * Skips specular map generation and the bezel highlight overlay. Only worth setting
   * for a surface opaque enough that the lit edge cannot be seen: generating a map that
   * is never composited costs a canvas rasterization and a PNG encode for nothing.
   */
  disableRefraction?: boolean;
  children?: React.ReactNode;
}
