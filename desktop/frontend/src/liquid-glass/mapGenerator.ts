import { DisplacementMapResult, RefractionEngineOptions } from './types';
import { generateRefractionLUT } from './refractionEngine';

interface MapCacheEntry {
  result: DisplacementMapResult;
  timestamp: number;
}

const mapCache = new Map<string, MapCacheEntry>();
const MAX_CACHE_SIZE = 64;
let cacheClock = 0;

/**
 * Computes 2D Signed Distance Field (SDF) and outward normal for a rounded rectangle.
 * @param x Current pixel x in [0, width]
 * @param y Current pixel y in [0, height]
 * @param width Element width
 * @param height Element height
 * @param radius Corner radius (clamped to min(width, height)/2)
 * @returns { distToEdge: distance from nearest outer edge (positive inside, negative outside), normalX: unit gradient X, normalY: unit gradient Y }
 */
export function calculateRoundedRectSDF(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): { distToEdge: number; normalX: number; normalY: number } {
  const halfW = width / 2;
  const halfH = height / 2;
  const clampedR = Math.min(radius, halfW, halfH);

  // Position relative to center
  const px = x - halfW;
  const py = y - halfH;

  // Vector from corner inner anchor to pixel in 1st quadrant
  const ax = Math.abs(px) - (halfW - clampedR);
  const ay = Math.abs(py) - (halfH - clampedR);

  let distToEdge = 0;
  let nx = 0;
  let ny = 0;

  if (ax > 0 && ay > 0) {
    // In corner zone
    const cornerDist = Math.hypot(ax, ay);
    distToEdge = clampedR - cornerDist;
    if (cornerDist > 1e-5) {
      nx = (ax / cornerDist) * Math.sign(px);
      ny = (ay / cornerDist) * Math.sign(py);
    } else {
      nx = Math.sign(px) || 1;
      ny = Math.sign(py) || 1;
    }
  } else if (ax > ay) {
    // In horizontal edge zone
    distToEdge = halfW - Math.abs(px);
    nx = Math.sign(px) || 1;
    ny = 0;
  } else {
    // In vertical edge zone
    distToEdge = halfH - Math.abs(py);
    nx = 0;
    ny = Math.sign(py) || 1;
  }

  return { distToEdge, normalX: nx, normalY: ny };
}

/**
 * Generates both the displacement map PNG Data URL and the specular highlight PNG Data URL.
 */
export function generateLiquidGlassMaps(
  width: number,
  height: number,
  radius: number,
  options: RefractionEngineOptions = {}
): DisplacementMapResult {
  const w = Math.max(8, Math.round(width));
  const h = Math.max(8, Math.round(height));
  const r = Math.min(radius, w / 2, h / 2);
  const bezel = Math.min(options.bezelWidth ?? 24, w / 2, h / 2);
  const surface = options.surface ?? 'squircle';
  const lightAngleDeg = options.lightAngle ?? -60;
  const lightElevDeg = options.lightElevation ?? 45;
  const thickness = options.glassThickness ?? 40;
  const baseThickness = options.baseThickness ?? 5;
  const glassIndex = options.glassRefractiveIndex ?? 1.5;

  // Cache key lookup
  const cacheKey = `${w}_${h}_${r}_${bezel}_${surface}_${lightAngleDeg}_${lightElevDeg}_${thickness}_${baseThickness}_${glassIndex}`;
  const cached = mapCache.get(cacheKey);
  if (cached) {
    cached.timestamp = ++cacheClock;
    mapCache.delete(cacheKey);
    mapCache.set(cacheKey, cached);
    return cached.result;
  }

  // Precompute 1D physics profile LUT
  const lutSamples = 256;
  const { lut, derivatives, maxDisplacement } = generateRefractionLUT(lutSamples, {
    glassRefractiveIndex: glassIndex,
    surface,
    glassThickness: thickness,
    baseThickness,
    bezelWidth: bezel,
  });

  // Only the specular map is rasterized. The displacement map existed to feed an SVG
  // feDisplacementMap, which has no GPU path and has been removed from the render
  // chain, so generating it would cost a full canvas pass and a PNG encode for an
  // image nothing samples.
  const specCanvas = document.createElement('canvas');
  specCanvas.width = w;
  specCanvas.height = h;
  const specCtx = specCanvas.getContext('2d');

  if (!specCtx) {
    const empty = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
    return {
      specularMapUrl: empty,
      maxDisplacement: 1,
      width: w,
      height: h,
      radius: r,
      bezelWidth: bezel,
    };
  }

  const specImageData = specCtx.createImageData(w, h);
  const specData = specImageData.data;
  const specBuf32 = new Uint32Array(specData.buffer);

  // Light incidence 3D unit vector
  const lightRad = (lightAngleDeg * Math.PI) / 180;
  const elevRad = (lightElevDeg * Math.PI) / 180;
  const lx = Math.cos(lightRad) * Math.cos(elevRad);
  const ly = Math.sin(lightRad) * Math.cos(elevRad);
  const lz = Math.sin(elevRad);

  // Rows fully interior to the bezel only need their left/right bands touched.
  const interiorTop = bezel;
  const interiorBottom = h - bezel;

  for (let y = 0; y < h; y++) {
    const isInteriorRow = y >= interiorTop && y < interiorBottom;
    const rowOffset = y * w;

    for (let x = 0; x < w; x++) {
      // Skip the flat middle span of interior rows in one jump.
      if (isInteriorRow && x === bezel && w - bezel > bezel) {
        x = w - bezel - 1;
        continue;
      }

      const idx = rowOffset + x;
      const { distToEdge, normalX, normalY } = calculateRoundedRectSDF(x + 0.5, y + 0.5, w, h, r);

      if (distToEdge < 0 || distToEdge >= bezel) {
        // Outside the shape or in the flat center: fully transparent, which the
        // buffer already is.
        continue;
      }

      // Inside curved bezel: t in [0, 1] (0 at outer edge, 1 at inner bezel)
      const t = Math.min(Math.max(distToEdge / bezel, 0), 1);
      const lutIdx = Math.min(Math.floor(t * (lutSamples - 1)), lutSamples - 1);

      // 3D Surface Normal for Specular Highlight:
      // In 3D: N = (normalX * slope, normalY * slope, 1.0) normalized
      const slope = derivatives[lutIdx];
      const nLen = Math.hypot(normalX * slope, normalY * slope, 1.0);
      const nx3 = (normalX * slope) / nLen;
      const ny3 = (normalY * slope) / nLen;
      const nz3 = 1.0 / nLen;

      // Specular reflection: R = 2*(N.L)*N - L
      const ndotl = nx3 * lx + ny3 * ly + nz3 * lz;
      let specIntensity = 0;

      if (ndotl > 0) {
        const rz = 2 * ndotl * nz3 - lz;

        // View vector V = (0, 0, 1) -> R.V = rz
        const rdotv = Math.max(0, rz);
        // Blinn-Phong exponent 28 for glossy glass sheen
        specIntensity = Math.pow(rdotv, 28);
      }

      // Fresnel Rim glow around curved perimeter: (1 - N.V)^3.5
      const ndotv = Math.max(0, nz3);
      const fresnel = Math.pow(1 - ndotv, 3.5);
      const rimLight = fresnel * Math.max(0, ndotl * 0.7 + 0.3);

      const totalSpecular = Math.min(1.0, specIntensity * 0.85 + rimLight * 0.65);
      const specAlpha = Math.round(totalSpecular * 255);

      // Specular is pure white with alpha channel modulated
      specBuf32[idx] = (specAlpha << 24) | 0x00ffffff;
    }
  }

  specCtx.putImageData(specImageData, 0, 0);

  const result: DisplacementMapResult = {
    specularMapUrl: specCanvas.toDataURL('image/png'),
    maxDisplacement,
    width: w,
    height: h,
    radius: r,
    bezelWidth: bezel,
  };

  // Manage cache capacity: Map preserves insertion order, so the first key is the
  // least recently inserted. Re-inserting on hit keeps it ordered by recency.
  if (mapCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = mapCache.keys().next().value;
    if (oldestKey !== undefined) mapCache.delete(oldestKey);
  }
  mapCache.set(cacheKey, { result, timestamp: ++cacheClock });

  return result;
}
