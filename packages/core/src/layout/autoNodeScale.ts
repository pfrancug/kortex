/**
 * Derive {@link Renderer.nodeSizeMultiplier} from graph geometry so billboard radii stay readable
 * without dominating sparse graphs — √(extent) + spacing cap avoids discs swallowing edges after layout.
 */

/** Largest axis-aligned bounding-box edge length (0 → 1). */
export function axisAlignedExtent(
  positions: Float32Array,
  nodeCount: number,
): number {
  if (nodeCount <= 0) return 1;

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < nodeCount; i++) {
    const o = i * 3;
    const x = positions[o];
    const y = positions[o + 1];
    const z = positions[o + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const dx = maxX - minX;
  const dy = maxY - minY;
  const dz = maxZ - minZ;
  const e = Math.max(dx, dy, dz);
  return Number.isFinite(e) && e > 1e-12 ? e : 1;
}

/** Typical {@link GraphStore.sizes} entry — median for modest N, strided mean for huge graphs. */
export function typicalStoredRadius(
  sizes: Float32Array,
  nodeCount: number,
): number {
  if (nodeCount <= 0) return 1;

  const cap = 8192;
  if (nodeCount <= cap) {
    const a = Array.from(sizes.subarray(0, nodeCount));
    a.sort((u, v) => u - v);
    const m = (nodeCount - 1) >> 1;
    const r = nodeCount % 2 !== 0 ? a[m]! : (a[m]! + a[m + 1]!) * 0.5;
    return r > 1e-8 ? r : 1;
  }

  let sum = 0;
  const stride = Math.ceil(nodeCount / cap);
  let c = 0;
  for (let i = 0; i < nodeCount; i += stride) {
    sum += sizes[i]!;
    c++;
  }
  const avg = sum / Math.max(c, 1);
  return avg > 1e-8 ? avg : 1;
}

function clampMul(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 1;
  return Math.min(Math.max(x, 0.03), 180);
}

/**
 * Suggested `Renderer.nodeSizeMultiplier`: scales stored radii so world billboard size
 * scales with bbox extent and gently shrinks when many nodes share the same space.
 */
export function suggestedNodeSizeMultiplierFromLayout(
  positions: Float32Array,
  nodeCount: number,
  sizes: Float32Array,
): number {
  if (nodeCount <= 0) return 1;

  const extent = axisAlignedExtent(positions, nodeCount);
  const typ = typicalStoredRadius(sizes, nodeCount);

  // Dense graphs → slightly smaller discs.
  const densityNorm = Math.pow(Math.max(nodeCount, 40) / 5000, -0.26);

  const extentSafe = Math.max(extent, 1e-6);
  const spacing = extent / Math.cbrt(Math.max(nodeCount, 8));

  // Sublinear in bbox extent — linear scaling made discs eat edges after layout spread disconnected clusters.
  const sqrtTerm = Math.sqrt(extentSafe) * 0.074 * densityNorm;
  const spacingCap = spacing * 0.34 * densityNorm;

  const targetWorldRadius = Math.min(sqrtTerm, spacingCap);
  return clampMul(targetWorldRadius / typ);
}
