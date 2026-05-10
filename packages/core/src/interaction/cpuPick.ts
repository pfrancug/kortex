/**
 * Pointer picking along the camera ray vs world spheres sized like billboards.
 * Screen-disk picking treated every overlapping projected circle as a hit, so nodes **behind**
 * occluders still “won” when their disk covered the cursor — broken only where depth stacks.
 */

import * as mat4 from '../renderer/math/mat4';

export interface CpuPickParams {
  /** Column-major 4×4 view matrix (same as {@link Camera.view}). */
  view: Float32Array<ArrayBufferLike>;
  /** Column-major 4×4 projection matrix (same as {@link Camera.projection}). */
  proj: Float32Array<ArrayBufferLike>;
  /** World-space camera eye (same as {@link Camera.position}). */
  eyeX: number;
  eyeY: number;
  eyeZ: number;
  positions: Float32Array<ArrayBufferLike>;
  sizes: Float32Array<ArrayBufferLike>;
  visibility: Uint8Array<ArrayBufferLike>;
  nodeCount: number;
  cursorFbX: number;
  cursorFbY: number;
  viewportWidth: number;
  viewportHeight: number;
  /** Same as {@link NodeRenderer.minScreenSize}. */
  minScreenSize: number;
  /**
   * Same factor as {@link Renderer.nodeSizeMultiplier} — scales radii for ray/sphere picking.
   * @defaultValue 1
   */
  nodeSizeMultiplier?: number;
}

function effectiveNodeSize(params: CpuPickParams, index: number): number {
  const mul = params.nodeSizeMultiplier ?? 1;
  return params.sizes[index] * mul;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Matches billboard World Size blend from NodeRenderer vertex shader (before quad expansion). */
function billboardWorldSize(
  nodeSize: number,
  scale: number,
  viewCenterZ: number,
  proj11: number,
  viewportHeight: number,
  minScreenSize: number,
): number {
  const depthSafe = Math.max(-viewCenterZ, 0.001);
  const naturalWorld = nodeSize * scale;
  const projScale = proj11 * viewportHeight * 0.5;
  const screenPxNatural = (naturalWorld * projScale) / depthSafe;
  const clampedWorld = (minScreenSize * depthSafe) / projScale;
  const band = Math.max(1.0, minScreenSize * 0.25);
  const t = smoothstep(
    minScreenSize - band,
    minScreenSize + band,
    screenPxNatural,
  );
  return clampedWorld + (naturalWorld - clampedWorld) * t;
}

function mulMat4Vec4(
  m: Float32Array<ArrayBufferLike>,
  x: number,
  y: number,
  z: number,
  w: number,
  out: Float32Array<ArrayBufferLike>,
): void {
  out[0] = m[0] * x + m[4] * y + m[8] * z + m[12] * w;
  out[1] = m[1] * x + m[5] * y + m[9] * z + m[13] * w;
  out[2] = m[2] * x + m[6] * y + m[10] * z + m[14] * w;
  out[3] = m[3] * x + m[7] * y + m[11] * z + m[15] * w;
}

const vcScratch = new Float32Array(4);
const clipScratch = new Float32Array(4);
const vpScratch = mat4.create();
const invVpScratch = mat4.create();
const farH = new Float32Array(4);

/** Ignore hits nearer than this along the ray (behind the eye / numerical noise). */
const RAY_T_MIN = 1e-4;

/**
 * Ray P(t) = O + t D, |D| = 1. Returns smallest t ≥ {@link RAY_T_MIN} where the ray enters the
 * sphere, or `-1` if it misses.
 */
function rayEnterSphere(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  cx: number,
  cy: number,
  cz: number,
  radius: number,
): number {
  if (!(radius > 0)) return -1;

  const lx = ox - cx;
  const ly = oy - cy;
  const lz = oz - cz;
  const b = lx * dx + ly * dy + lz * dz;
  const ll = lx * lx + ly * ly + lz * lz;
  const disc = b * b - ll + radius * radius;
  if (disc < 0) return -1;

  const s = Math.sqrt(disc);
  let t = -b - s;
  if (t < RAY_T_MIN) t = -b + s;
  if (t < RAY_T_MIN) return -1;
  return t;
}

function worldSphereRadius(
  params: CpuPickParams,
  index: number,
  proj11: number,
): number {
  const {
    view,
    positions,
    visibility,
    viewportHeight,
    minScreenSize,
  } = params;
  if (visibility[index] === 0) return -1;

  const scale = 1.0;
  const j = index * 3;
  mulMat4Vec4(
    view,
    positions[j],
    positions[j + 1],
    positions[j + 2],
    1,
    vcScratch,
  );
  const vcz = vcScratch[2];

  const worldSize = billboardWorldSize(
    effectiveNodeSize(params, index),
    scale,
    vcz,
    proj11,
    viewportHeight,
    minScreenSize,
  );
  return worldSize * 0.5;
}

/** Unit ray direction through cursor into the scene (world space). */
function pickRayDir(
  params: CpuPickParams,
): Float32Array<ArrayBufferLike> | null {
  const {
    proj,
    view,
    eyeX,
    eyeY,
    eyeZ,
    cursorFbX,
    cursorFbY,
    viewportWidth,
    viewportHeight,
  } = params;

  mat4.multiply(vpScratch, proj as mat4.Mat4, view as mat4.Mat4);
  if (!mat4.invert(invVpScratch, vpScratch)) return null;

  const nx = (2 * (cursorFbX + 0.5)) / viewportWidth - 1;
  const ny = 1 - (2 * (cursorFbY + 0.5)) / viewportHeight;

  mulMat4Vec4(invVpScratch, nx, ny, 1, 1, farH);
  const fw = farH[3];
  if (!(Math.abs(fw) > 1e-10)) return null;

  const fx = farH[0] / fw;
  const fy = farH[1] / fw;
  const fz = farH[2] / fw;

  let dx = fx - eyeX;
  let dy = fy - eyeY;
  let dz = fz - eyeZ;
  const len = Math.hypot(dx, dy, dz);
  if (!(len > 1e-10)) return null;

  dx /= len;
  dy /= len;
  dz /= len;

  farH[0] = dx;
  farH[1] = dy;
  farH[2] = dz;
  return farH;
}

/** Trace eye→scene ray (unit `dir`) and return closest sphere hit index, or `-1`. */
function traceNearestSphere(
  params: CpuPickParams,
  dir: Float32Array<ArrayBufferLike>,
): number {
  const { eyeX, eyeY, eyeZ, positions, visibility, nodeCount, proj } = params;

  const dx = dir[0];
  const dy = dir[1];
  const dz = dir[2];

  const proj11 = proj[5];
  let best = -1;
  let bestT = Number.POSITIVE_INFINITY;

  for (let i = 0; i < nodeCount; i++) {
    if (visibility[i] === 0) continue;

    const R = worldSphereRadius(params, i, proj11);
    if (R <= 0) continue;

    const j = i * 3;
    const t = rayEnterSphere(
      eyeX,
      eyeY,
      eyeZ,
      dx,
      dy,
      dz,
      positions[j],
      positions[j + 1],
      positions[j + 2],
      R,
    );

    if (t >= 0 && t < bestT) {
      bestT = t;
      best = i;
    }
  }

  return best;
}

/** Screen-disk fallback when VP inversion fails (degenerate camera). */
function pickClosestNodeScreenDiskFallback(params: CpuPickParams): number {
  const {
    nodeCount,
    cursorFbX,
    cursorFbY,
    viewportWidth,
    viewportHeight,
    proj,
    view,
    positions,
    visibility,
    minScreenSize,
  } = params;

  const proj11 = proj[5];
  const projScale = proj11 * viewportHeight * 0.5;
  const mx = cursorFbX;
  const my = cursorFbY;

  let best = -1;
  let bestViewZ = Number.POSITIVE_INFINITY;

  for (let i = 0; i < nodeCount; i++) {
    if (visibility[i] === 0) continue;

    const scale = 1.0;
    const j = i * 3;
    mulMat4Vec4(
      view,
      positions[j],
      positions[j + 1],
      positions[j + 2],
      1,
      vcScratch,
    );
    const vcz = vcScratch[2];

    const worldSize = billboardWorldSize(
      effectiveNodeSize(params, i),
      scale,
      vcz,
      proj11,
      viewportHeight,
      minScreenSize,
    );
    const depthSafe = Math.max(-vcz, 0.001);
    const screenRadiusPx = (0.5 * worldSize * projScale) / depthSafe;

    mulMat4Vec4(
      proj,
      vcScratch[0],
      vcScratch[1],
      vcScratch[2],
      vcScratch[3],
      clipScratch,
    );

    const cw = clipScratch[3];
    if (!(cw > 1e-6)) continue;

    const ndcX = clipScratch[0] / cw;
    const ndcY = clipScratch[1] / cw;

    const sx = (ndcX * 0.5 + 0.5) * viewportWidth;
    const syTop = (1.0 - ndcY) * 0.5 * viewportHeight;

    const ddx = sx - mx;
    const ddy = syTop - my;
    const d2 = ddx * ddx + ddy * ddy;
    const r2 = screenRadiusPx * screenRadiusPx;
    if (d2 <= r2 && vcz < bestViewZ) {
      bestViewZ = vcz;
      best = i;
    }
  }

  return best;
}

/**
 * Occlusion-correct pick: nearest sphere hit along the camera ray through the pixel.
 * Falls back to disk picking only if view-projection inversion fails.
 */
export function pickClosestNodeScreen(params: CpuPickParams): number {
  const { nodeCount, cursorFbX, cursorFbY, viewportWidth, viewportHeight } =
    params;

  if (
    nodeCount <= 0 ||
    viewportWidth < 1 ||
    viewportHeight < 1 ||
    cursorFbX < 0 ||
    cursorFbY < 0 ||
    cursorFbX >= viewportWidth ||
    cursorFbY >= viewportHeight
  ) {
    return -1;
  }

  const dir = pickRayDir(params);
  if (!dir) return pickClosestNodeScreenDiskFallback(params);

  return traceNearestSphere(params, dir);
}

/**
 * Hover pick with hysteresis: tolerate boundary/layout jitter without resurrecting occluded nodes.
 */
export function pickHoverStable(
  params: CpuPickParams,
  stickyHover: number | null,
  stickyRelaxFactor = 1.45,
): number {
  const dir = pickRayDir(params);
  const strict =
    dir !== null
      ? traceNearestSphere(params, dir)
      : pickClosestNodeScreenDiskFallback(params);

  if (
    stickyHover === null ||
    stickyHover < 0 ||
    stickyHover >= params.nodeCount ||
    params.visibility[stickyHover] === 0
  ) {
    return strict;
  }

  const {
    nodeCount,
    cursorFbX,
    cursorFbY,
    viewportWidth,
    viewportHeight,
    eyeX,
    eyeY,
    eyeZ,
    proj,
  } = params;

  if (
    nodeCount <= 0 ||
    viewportWidth < 1 ||
    viewportHeight < 1 ||
    cursorFbX < 0 ||
    cursorFbY < 0 ||
    cursorFbX >= viewportWidth ||
    cursorFbY >= viewportHeight
  ) {
    return strict;
  }

  if (!dir) {
    return strict;
  }

  const dx = dir[0];
  const dy = dir[1];
  const dz = dir[2];
  const proj11 = proj[5];

  const Rs = worldSphereRadius(params, stickyHover, proj11);
  if (Rs <= 0) return strict;

  const j = stickyHover * 3;
  const cx = params.positions[j];
  const cy = params.positions[j + 1];
  const cz = params.positions[j + 2];

  const tStickyStrict = rayEnterSphere(
    eyeX,
    eyeY,
    eyeZ,
    dx,
    dy,
    dz,
    cx,
    cy,
    cz,
    Rs,
  );
  const tStickyRel = rayEnterSphere(
    eyeX,
    eyeY,
    eyeZ,
    dx,
    dy,
    dz,
    cx,
    cy,
    cz,
    Rs * stickyRelaxFactor,
  );

  if (tStickyRel < 0) return strict;

  if (strict < 0) return stickyHover;
  if (strict === stickyHover) return stickyHover;

  const Rwin = worldSphereRadius(params, strict, proj11);
  if (Rwin <= 0) return stickyHover;

  const sj = strict * 3;
  const tStrict = rayEnterSphere(
    eyeX,
    eyeY,
    eyeZ,
    dx,
    dy,
    dz,
    params.positions[sj],
    params.positions[sj + 1],
    params.positions[sj + 2],
    Rwin,
  );

  if (tStrict < 0) return stickyHover;

  const depthTEps = 2e-4;
  if (tStrict + depthTEps < tStickyStrict) return strict;

  return stickyHover;
}
