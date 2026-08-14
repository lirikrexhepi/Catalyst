import { LiquidGlassSurface, RefractionEngineOptions } from './types';

/**
 * Surface profile equations f(t) where t in [0, 1] is normalized distance
 * from the outer border (t=0) to the flat inner surface (t=1).
 * Returns the normalized height y in [0, 1].
 */
export function convexCircle(t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  return Math.sqrt(Math.max(0, 1 - Math.pow(1 - x, 2)));
}

/**
 * Apple's 4th-order Squircle curvature.
 * Provides continuous curvature derivatives (smooth G2 continuity),
 * eliminating harsh interior reflection seams when stretched into rectangles.
 */
export function convexSquircle(t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  return Math.pow(Math.max(0, 1 - Math.pow(1 - x, 4)), 0.25);
}

/**
 * Concave bowl profile (complement of convex).
 */
export function concave(t: number): number {
  return 1 - convexSquircle(t);
}

/**
 * Smootherstep polynomial: 6t^5 - 15t^4 + 10t^3
 */
export function smootherstep(t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * Lip profile: blends convex rim into a shallow concave center.
 */
export function lip(t: number): number {
  const cv = convexSquircle(t);
  const cc = concave(t);
  const blend = smootherstep(t);
  return (1 - blend) * cv + blend * cc;
}

export function evaluateSurface(t: number, surface: LiquidGlassSurface): number {
  switch (surface) {
    case 'circle':
      return convexCircle(t);
    case 'concave':
      return concave(t);
    case 'lip':
      return lip(t);
    case 'squircle':
    default:
      return convexSquircle(t);
  }
}

/**
 * Approximates the 1D surface derivative f'(t) at normalized coordinate t.
 */
export function evaluateDerivative(
  t: number,
  surface: LiquidGlassSurface,
  delta: number = 0.001
): number {
  const t1 = Math.max(0, t - delta);
  const t2 = Math.min(1, t + delta);
  const y1 = evaluateSurface(t1, surface);
  const y2 = evaluateSurface(t2, surface);
  return (y2 - y1) / (t2 - t1 || 1e-6);
}

export interface RefractionResult {
  /** Lateral displacement in pixels along the surface gradient */
  displacement: number;
  /** Angle of incidence theta_1 in radians */
  incidentAngle: number;
  /** Angle of refraction theta_2 in radians */
  refractedAngle: number;
  /** Surface height in pixels */
  height: number;
  /** Surface slope derivative f'(t) */
  derivative: number;
  /** Normal vector in 2D cross-section (dx, dy) */
  normal: { x: number; y: number };
}

/**
 * Calculates physics-based Snell's law refraction for a light ray at normalized distance t in [0, 1].
 */
export function calculateRayRefraction(
  t: number,
  options: RefractionEngineOptions = {}
): RefractionResult {
  const {
    glassRefractiveIndex = 1.5,
    ambientRefractiveIndex = 1.0,
    surface = 'squircle',
    glassThickness = 40,
    baseThickness = 5,
  } = options;

  const heightNorm = evaluateSurface(t, surface);
  const totalHeight = baseThickness + glassThickness * heightNorm;
  const derivative = evaluateDerivative(t, surface);

  // Normal vector in 2D profile rotated by -90 deg: (-derivative, 1) normalized
  const normLen = Math.hypot(-derivative, 1);
  const normal = {
    x: -derivative / normLen,
    y: 1 / normLen,
  };

  // Angle of incidence relative to surface normal (incoming ray is orthogonal to flat background [0, 1])
  // dot(ray_in, normal) = normal.y = cos(theta_1)
  const incidentAngle = Math.atan(Math.abs(derivative));

  // Snell-Descartes Law: n1 * sin(theta_1) = n2 * sin(theta_2)
  const sinTheta1 = Math.sin(incidentAngle);
  const sinTheta2 = (ambientRefractiveIndex / glassRefractiveIndex) * sinTheta1;

  // Check for total internal reflection (not expected when going from n=1.0 to n=1.5, but handled safely)
  let refractedAngle = 0;
  if (Math.abs(sinTheta2) <= 1) {
    refractedAngle = Math.asin(sinTheta2);
  } else {
    refractedAngle = incidentAngle;
  }

  // Refraction bend angle (theta_1 - theta_2)
  const deltaAngle = incidentAngle - refractedAngle;

  // Lateral shift distance on the underlying backdrop plane:
  // displacement = height * tan(theta_1 - theta_2)
  // Direction pushes away from the center / towards outer normal
  const displacement = totalHeight * Math.tan(deltaAngle);

  return {
    displacement,
    incidentAngle,
    refractedAngle,
    height: totalHeight,
    derivative,
    normal,
  };
}

/**
 * Precalculates the 1D displacement profile lookup table across the bezel width
 * and finds the maximum displacement for SVG normalization.
 */
export function generateRefractionLUT(
  samples: number = 256,
  options: RefractionEngineOptions = {}
): {
  lut: Float32Array;
  derivatives: Float32Array;
  maxDisplacement: number;
} {
  const lut = new Float32Array(samples);
  const derivatives = new Float32Array(samples);
  let maxDisplacement = 0.0001;

  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const result = calculateRayRefraction(t, options);
    lut[i] = result.displacement;
    derivatives[i] = result.derivative;
    if (Math.abs(result.displacement) > maxDisplacement) {
      maxDisplacement = Math.abs(result.displacement);
    }
  }

  return { lut, derivatives, maxDisplacement };
}
