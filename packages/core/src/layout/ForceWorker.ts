/**
 * Web Worker entry point for force-directed graph layout.
 *
 * **Model:** Barnes–Hut many-body repulsion, edge springs, center force, velocity decay,
 * deterministic cooling (`alpha` → `alphaMin`), optional bbox clamp (`extentBudgetFactor` > 0).
 *
 * **Extended parameters** (`forceScaleMode`, `linkAttractionMode`, `integrationMode`, …) live on
 * {@link ForceConfig}. Edge weights: `edgeWeights` buffer + {@link ForceConfig.edgeWeightInfluence}
 * (see `docs/GUIDELINES.md` — force layout). **`linkAttractionMode`** selects spring math inside one
 * shared link loop (legacy **`nexgraph_custom`** remains for stability preset).
 */

import { buildPerEdgeLinkPhysics } from './edgeWeightFactors';

// ── Physics mode types (exported for `@nexgraph/core` consumers) ───────

/** Whether nominal `chargeStrength` / `linkDistance` are auto-rescaled from graph size. */
export type ForceScaleMode = 'none' | 'auto';

/**
 * Link spring formulation. **`d3_like`** matches d3-force-3d link velocity semantics;
 * **`nexgraph_custom`** uses position-only deltas (legacy stability path).
 */
export type LinkAttractionMode = 'd3_like' | 'nexgraph_custom';

/** Velocity update order and steps. **`standard`** = link forces → charge → center → decay → integrate (d3 simulation tick order). */
export type IntegrationMode = 'standard' | 'legacy';

/** How edge weights influence springs when provided (`Phase C`). */
export type EdgeWeightInfluence =
  | 'off'
  | 'linkStrength'
  | 'linkDistance'
  | 'both';

// ── Messages ────────────────────────────────────────────────────────

export interface ForceConfig {
  /**
   * Per-node many-body strength (negative = repulsion). Typical d3-force-3d-style default **-60**.
   */
  chargeStrength: number;
  /** Target edge length — d3-force link default **30**. */
  linkDistance: number;
  /**
   * Scales d3 link strengths (`1/min(degree)`). Library-equivalent default **1**; increase if springs
   * feel too weak on very large graphs.
   */
  linkStrengthMultiplier: number;
  /** Link relaxation passes per tick (d3-force default **1**). */
  linkIterations: number;
  /** Barnes–Hut opening criterion θ (d3-force default ≈ **0.9** → θ² = 0.81). */
  theta: number;
  /** Minimum distance² floor for charge (d3 many-body **distanceMin** default **1**). */
  distanceMin: number;

  /** Simulation cooling (starts at **1** each `start`). */
  alpha: number;
  alphaDecay: number;
  alphaTarget: number;
  /** Stop when alpha drops below this (d3 default **0.001**). */
  alphaMin: number;

  /**
   * Exposed like d3’s getter: stored multiplier on velocity is **1 − velocityDecay**.
   * Default **0.4** ⇒ multiply velocity by **0.6** each tick (matches common d3 simulation decay).
   */
  velocityDecay: number;

  /**
   * Center force strength (d3 default **1**): each tick, translate all nodes so the
   * centroid moves toward `(centerX, centerY, centerZ)`.
   */
  centerStrength: number;
  centerX: number;
  centerY: number;
  centerZ: number;

  maxVelocity: number;
  /** Maximum ticks (interactive demos often run until cooled; we cap iterations). */
  maxIterations: number;

  /**
   * Each tick the layout bbox may not exceed `topology_extent_budget × factor`, where the
   * topology budget is derived from {@link ForceConfig.linkDistance} and node count only —
   * not from the current point cloud (so repeated Auto Layout runs don't ratchet outward).
   * Set ≤ 0 to disable clamping.
   */
  extentBudgetFactor: number;

  /**
   * **`none`** — use nominal {@link ForceConfig.linkDistance} and {@link ForceConfig.chargeStrength}
   * as Barnes-Hut / link targets (interoperability-style fixed nominal physics).
   * **`auto`** — rescale effective link length & charge from node count / avg degree (stability).
   */
  forceScaleMode: ForceScaleMode;

  /** Which link-force implementation runs inside the worker (`Phase B` branches on this). */
  linkAttractionMode: LinkAttractionMode;

  /** Integration path: **`standard`** = link → charge → center (d3 tick order); **`legacy`** = charge → link → center (pre–Phase B). */
  integrationMode: IntegrationMode;

  /**
   * After normal convergence, translate all nodes so the centroid sits on the layout center.
   * **`false`** avoids a final jump vs layouts exported from other tools; **`true`** helps camera-fit pipelines.
   */
  recenterOnFinish: boolean;

  /** How per-edge weights adjust springs when {@link ForceStartMsg.edgeWeights} is present (uniform weights ≡ off). */
  edgeWeightInfluence: EdgeWeightInfluence;

  /** When **`false`**, {@link ForceConfig.maxVelocity} is ignored (pure decay-limited motion). */
  clampVelocity: boolean;
}

export interface ForceStartMsg {
  type: 'start';
  positions: Float32Array;
  edgeIndices: Uint32Array;
  nodeCount: number;
  edgeCount: number;
  /** Per-edge weights aligned with `edgeIndices` pairs (`edgeWeights[e]` for edge `e`). */
  edgeWeights?: Float32Array;
  config: ForceConfig;
}

export interface ForceStopMsg {
  type: 'stop';
}

export interface ForceConfigMsg {
  type: 'config';
  config: Partial<ForceConfig>;
}

export type ForceRequest = ForceStartMsg | ForceStopMsg | ForceConfigMsg;

export interface ForceTickResult {
  type: 'tick';
  positions: Float32Array;
  energy: number;
  iteration: number;
}

export interface ForceStabilizedResult {
  type: 'stabilized';
  positions: Float32Array;
  iteration: number;
}

export type ForceResponse = ForceTickResult | ForceStabilizedResult;

/**
 * Product defaults match **`interoperability`**: nominal charge/link distance (`forceScaleMode: 'none'`),
 * **`d3_like`** links, **`standard`** integration (link → charge → center).
 * {@link createForceConfigPreset} with **`'stability'`** restores auto scaling + **`nexgraph_custom`** links +
 * **`legacy`** tick order (still supported via {@link ForceConfig.linkAttractionMode} /
 * {@link ForceConfig.integrationMode}).
 *
 * `extentBudgetFactor` **0** = no bbox clamp.
 */
export const FORCE_LAYOUT_DEFAULTS: ForceConfig = {
  chargeStrength: -60,
  linkDistance: 30,
  linkStrengthMultiplier: 1,
  linkIterations: 1,
  theta: 0.9,
  distanceMin: 1,

  alpha: 1,
  alphaDecay: 0.0228,
  alphaTarget: 0,
  alphaMin: 0.001,

  velocityDecay: 0.4,

  centerStrength: 1,
  centerX: 0,
  centerY: 0,
  centerZ: 0,

  maxVelocity: 18,
  maxIterations: 2800,

  extentBudgetFactor: 0,

  forceScaleMode: 'none',
  linkAttractionMode: 'd3_like',
  integrationMode: 'standard',
  recenterOnFinish: false,
  edgeWeightInfluence: 'off',
  clampVelocity: true,
};

// ── Octree (geometric cell + COM; Barnes–Hut) ───────────────────────

const MAX_DEPTH = 24;
const EMPTY_LEAF = -1;

interface OctreeNode {
  cx: number;
  cy: number;
  cz: number;
  /** Half-edge of axis-aligned cube [cx ± half]. */
  half: number;

  comX: number;
  comY: number;
  comZ: number;
  /** Sum of absolute charge weights (for COM accumulation). */
  w: number;
  /** Signed charge sum for this cell (many-body aggregate). */
  q: number;

  leaf: boolean;
  bodyIdx: number;
  children: (OctreeNode | null)[] | null;
}

function makeOctreeNode(
  cx: number,
  cy: number,
  cz: number,
  half: number,
): OctreeNode {
  return {
    cx,
    cy,
    cz,
    half,
    comX: 0,
    comY: 0,
    comZ: 0,
    w: 0,
    q: 0,
    leaf: true,
    bodyIdx: EMPTY_LEAF,
    children: null,
  };
}

function aggregateFromChildren(node: OctreeNode): void {
  let wx = 0;
  let wy = 0;
  let wz = 0;
  let wsum = 0;
  let qsum = 0;
  const ch = node.children;
  if (!ch) return;
  for (let i = 0; i < 8; i++) {
    const c = ch[i];
    if (!c || c.w === 0) continue;
    wx += c.comX * c.w;
    wy += c.comY * c.w;
    wz += c.comZ * c.w;
    wsum += c.w;
    qsum += c.q;
  }
  node.w = wsum;
  node.q = qsum;
  if (wsum > 0) {
    const inv = 1 / wsum;
    node.comX = wx * inv;
    node.comY = wy * inv;
    node.comZ = wz * inv;
  }
}

function octantOf(
  px: number,
  py: number,
  pz: number,
  cx: number,
  cy: number,
  cz: number,
): number {
  let o = 0;
  if (px >= cx) o |= 1;
  if (py >= cy) o |= 2;
  if (pz >= cz) o |= 4;
  return o;
}

function childCenter(
  oct: number,
  cx: number,
  cy: number,
  cz: number,
  half: number,
): [number, number, number] {
  const qh = half * 0.5;
  let ccx = cx - qh;
  let ccy = cy - qh;
  let ccz = cz - qh;
  if (oct & 1) ccx = cx + qh;
  if (oct & 2) ccy = cy + qh;
  if (oct & 4) ccz = cz + qh;
  return [ccx, ccy, ccz];
}

function insertBody(
  node: OctreeNode,
  idx: number,
  px: number,
  py: number,
  pz: number,
  charge: number,
  depth: number,
): void {
  if (depth > MAX_DEPTH) return;

  if (node.leaf && node.w === 0) {
    node.bodyIdx = idx;
    node.comX = px;
    node.comY = py;
    node.comZ = pz;
    node.w = Math.abs(charge);
    node.q = charge;
    return;
  }

  if (node.leaf && node.w > 0) {
    const oldIdx = node.bodyIdx;
    const ox = node.comX;
    const oy = node.comY;
    const oz = node.comZ;
    const oldQ = node.q;

    node.leaf = false;
    node.bodyIdx = EMPTY_LEAF;
    node.children = new Array(8).fill(null);
    node.w = 0;
    node.q = 0;

    insertBody(node, oldIdx, ox, oy, oz, oldQ, depth + 1);
    insertBody(node, idx, px, py, pz, charge, depth + 1);
    aggregateFromChildren(node);
    return;
  }

  // Internal node
  const oct = octantOf(px, py, pz, node.cx, node.cy, node.cz);
  const [ccx, ccy, ccz] = childCenter(
    oct,
    node.cx,
    node.cy,
    node.cz,
    node.half,
  );
  const childHalf = node.half * 0.5;
  if (!node.children![oct]) {
    node.children![oct] = makeOctreeNode(ccx, ccy, ccz, childHalf);
  }
  insertBody(node.children![oct]!, idx, px, py, pz, charge, depth + 1);
  aggregateFromChildren(node);
}

function cellContains(
  node: OctreeNode,
  px: number,
  py: number,
  pz: number,
): boolean {
  const h = node.half + 1e-9;
  return (
    Math.abs(px - node.cx) <= h &&
    Math.abs(py - node.cy) <= h &&
    Math.abs(pz - node.cz) <= h
  );
}

/** Accumulate many-body delta-velocity (d3-style: Δv += dir * alpha * Q / dist²). */
function barnesHutCharge(
  node: OctreeNode,
  px: number,
  py: number,
  pz: number,
  selfIdx: number,
  alpha: number,
  theta2: number,
  distMinSq: number,
  dvx: Float64Array,
  dvy: Float64Array,
  dvz: Float64Array,
): void {
  if (node.w === 0) return;

  if (node.leaf && node.bodyIdx === selfIdx) return;

  const dx = node.comX - px;
  const dy = node.comY - py;
  const dz = node.comZ - pz;
  let distSq = dx * dx + dy * dy + dz * dz;

  const span = node.half * 2;
  const openSubtree = !node.leaf && cellContains(node, px, py, pz);

  if (!node.leaf) {
    const useApprox = !openSubtree && (span * span) / theta2 < distSq;
    if (!useApprox) {
      const ch = node.children!;
      for (let i = 0; i < 8; i++) {
        const c = ch[i];
        if (c)
          barnesHutCharge(
            c,
            px,
            py,
            pz,
            selfIdx,
            alpha,
            theta2,
            distMinSq,
            dvx,
            dvy,
            dvz,
          );
      }
      return;
    }
    distSq = Math.max(distSq, distMinSq);
    const s = (alpha * node.q) / distSq;
    dvx[selfIdx] += dx * s;
    dvy[selfIdx] += dy * s;
    dvz[selfIdx] += dz * s;
    return;
  }

  if (node.bodyIdx !== EMPTY_LEAF) {
    distSq = Math.max(distSq, distMinSq);
    const s = (alpha * node.q) / distSq;
    dvx[selfIdx] += dx * s;
    dvy[selfIdx] += dy * s;
    dvz[selfIdx] += dz * s;
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Shrinks the cloud uniformly about its bbox center when extent exceeds `budget`.
 * Scales velocities too so clamping does not immediately snap outward again.
 */
function clampBBoxExtent(
  positions: Float32Array,
  velocitiesX: Float64Array,
  velocitiesY: Float64Array,
  velocitiesZ: Float64Array,
  nodeCount: number,
  budget: number,
): void {
  if (!(budget > 0 && Number.isFinite(budget)) || nodeCount <= 0) return;

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

  const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  if (extent <= budget || extent < 1e-12) return;

  const s = budget / extent;
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const cz = (minZ + maxZ) * 0.5;

  for (let i = 0; i < nodeCount; i++) {
    const o = i * 3;
    positions[o] = (positions[o] - cx) * s + cx;
    positions[o + 1] = (positions[o + 1] - cy) * s + cy;
    positions[o + 2] = (positions[o + 2] - cz) * s + cz;
    velocitiesX[i] *= s;
    velocitiesY[i] *= s;
    velocitiesZ[i] *= s;
  }
}

// ── Link precompute (d3-force-3d link.js) ───────────────────────────

function buildLinkCoeffs(
  edgeIndices: Uint32Array,
  edgeCount: number,
  nodeCount: number,
  linkStrengthMultiplier: number,
): { degree: Uint32Array; strength: Float64Array; bias: Float64Array } {
  const degree = new Uint32Array(nodeCount);
  for (let e = 0; e < edgeCount; e++) {
    const u = edgeIndices[e * 2];
    const v = edgeIndices[e * 2 + 1];
    degree[u]++;
    degree[v]++;
  }
  const strength = new Float64Array(edgeCount);
  const bias = new Float64Array(edgeCount);
  const mult =
    Number.isFinite(linkStrengthMultiplier) && linkStrengthMultiplier > 0
      ? linkStrengthMultiplier
      : 1;
  for (let e = 0; e < edgeCount; e++) {
    const u = edgeIndices[e * 2];
    const v = edgeIndices[e * 2 + 1];
    const du = degree[u];
    const dv = degree[v];
    strength[e] = (1 / Math.min(du, dv)) * mult;
    bias[e] = du / (du + dv);
  }
  return { degree, strength, bias };
}

function applyCenterForce(
  positions: Float32Array,
  nodeCount: number,
  strength: number,
  tx: number,
  ty: number,
  tz: number,
): void {
  if (strength === 0 || nodeCount === 0) return;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (let i = 0; i < nodeCount; i++) {
    const o = i * 3;
    sx += positions[o];
    sy += positions[o + 1];
    sz += positions[o + 2];
  }
  const inv = 1 / nodeCount;
  sx = (sx * inv - tx) * strength;
  sy = (sy * inv - ty) * strength;
  sz = (sz * inv - tz) * strength;
  for (let i = 0; i < nodeCount; i++) {
    const o = i * 3;
    positions[o] -= sx;
    positions[o + 1] -= sy;
    positions[o + 2] -= sz;
  }
}

/**
 * One link-force sweep per iteration: **`d3Like`** uses position+velocity separation (d3-force-3d);
 * **`false`** uses position-only deltas ({@link LinkAttractionMode} **`nexgraph_custom`**).
 */
function applyLinkPassesSinglePass(
  d3Like: boolean,
  positions: Float32Array,
  edgeIndices: Uint32Array,
  edgeCount: number,
  strength: Float64Array,
  bias: Float64Array,
  linkDistancePerEdge: Float64Array,
  alpha: number,
  vx: Float64Array,
  vy: Float64Array,
  vz: Float64Array,
): void {
  const jitter = 1e-12;
  for (let e = 0; e < edgeCount; e++) {
    const src = edgeIndices[e * 2];
    const dst = edgeIndices[e * 2 + 1];
    const os = src * 3;
    const od = dst * 3;

    let x = positions[od] - positions[os];
    let y = positions[od + 1] - positions[os + 1];
    let z = positions[od + 2] - positions[os + 2];
    if (d3Like) {
      x += vx[dst] - vx[src];
      y += vy[dst] - vy[src];
      z += vz[dst] - vz[src];
    }

    if (Math.abs(x) < jitter) x = jitter * (e % 2 === 0 ? 1 : -1);
    if (Math.abs(y) < jitter) y = jitter * ((e >> 1) % 2 === 0 ? 1 : -1);
    if (Math.abs(z) < jitter) z = jitter * ((e >> 2) % 2 === 0 ? 1 : -1);

    const len = Math.sqrt(x * x + y * y + z * z);
    const str = strength[e];
    const b = bias[e];
    const ideal = linkDistancePerEdge[e];

    const scale = d3Like
      ? ((len - ideal) / Math.max(len, 1e-18)) * alpha * str
      : ((len - ideal) / len) * alpha * str;

    x *= scale;
    y *= scale;
    z *= scale;

    vx[dst] -= x * b;
    vy[dst] -= y * b;
    vz[dst] -= z * b;

    vx[src] += x * (1 - b);
    vy[src] += y * (1 - b);
    vz[src] += z * (1 - b);
  }
}

// ── Simulation state ────────────────────────────────────────────────

let running = false;
let positions: Float32Array;
let velocitiesX: Float64Array;
let velocitiesY: Float64Array;
let velocitiesZ: Float64Array;
let edgeIndices: Uint32Array;
let linkStrength: Float64Array;
let linkStrengthBase: Float64Array;
let linkDistancePerEdge: Float64Array;
let linkBias: Float64Array;
let edgeWeightsStored: Float32Array | null = null;
let nodeCount: number;
let edgeCount: number;
let config: ForceConfig;
let iteration: number;
let simAlpha: number;
/** Derived once per `start` — tighter packing for small graphs; balances Coulomb vs springs. */
let effectiveLinkDistance: number;
let effectiveCharge: number;
/** Reference bbox edge length for {@link clampBBoxExtent}; topology-only (not live positions). */
let extentBudgetBaseExtent: number;
/** Allowed axis-aligned bbox edge length before uniform shrink (see {@link clampBBoxExtent}). */
let extentBudget: number;

function recenter(
  positionsBuf: Float32Array,
  nodeCountN: number,
  gx: number,
  gy: number,
  gz: number,
): void {
  if (nodeCountN <= 0) return;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < nodeCountN; i++) {
    const o = i * 3;
    cx += positionsBuf[o];
    cy += positionsBuf[o + 1];
    cz += positionsBuf[o + 2];
  }
  const inv = 1 / nodeCountN;
  cx *= inv;
  cy *= inv;
  cz *= inv;
  const tx = gx - cx;
  const ty = gy - cy;
  const tz = gz - cz;
  for (let i = 0; i < nodeCountN; i++) {
    const o = i * 3;
    positionsBuf[o] += tx;
    positionsBuf[o + 1] += ty;
    positionsBuf[o + 2] += tz;
  }
}

/** Match Coulomb vs springs after `linkDistance` / `chargeStrength` / scale mode changes. */
function recomputeEffectiveLinkPhysics(): void {
  if (nodeCount <= 0) return;
  if (config.forceScaleMode === 'none') {
    effectiveLinkDistance = config.linkDistance;
    effectiveCharge = config.chargeStrength;
    return;
  }

  const refN = 8000;
  const nShrink = clamp(
    Math.pow(Math.min(nodeCount, refN * 3) / refN, 1 / 3),
    0.35,
    1.08,
  );
  effectiveLinkDistance = config.linkDistance * nShrink;
  const ldRatio = effectiveLinkDistance / Math.max(config.linkDistance, 1e-6);
  effectiveCharge = config.chargeStrength * ldRatio * ldRatio;

  const avgDeg = nodeCount > 0 ? (2 * edgeCount) / nodeCount : 0;
  if (avgDeg > 1e-6 && avgDeg < 10) {
    effectiveCharge *= clamp(Math.pow(avgDeg / 10, 1.15), 0.22, 1);
  }
}

/** Scale allowance for bbox clamp from link distance × graph size (stable across layout restarts). */
function recomputeExtentBudgetBaseFromTopology(): void {
  if (nodeCount <= 0) return;
  extentBudgetBaseExtent = Math.max(
    effectiveLinkDistance * Math.cbrt(Math.max(nodeCount, 8)),
    14,
  );
}

function recomputeExtentBudget(): void {
  if (nodeCount <= 0) return;
  if (config.extentBudgetFactor <= 0) {
    extentBudget = Infinity;
    return;
  }
  extentBudget = Math.max(
    extentBudgetBaseExtent * config.extentBudgetFactor,
    effectiveLinkDistance * 3,
  );
}

function start(msg: ForceStartMsg): void {
  positions = new Float32Array(msg.positions);
  nodeCount = msg.nodeCount;
  edgeCount = msg.edgeCount;
  edgeIndices = msg.edgeIndices;
  config = { ...FORCE_LAYOUT_DEFAULTS, ...msg.config };
  simAlpha = config.alpha;
  iteration = 0;

  recomputeEffectiveLinkPhysics();
  recomputeExtentBudgetBaseFromTopology();
  recomputeExtentBudget();

  const coeffs = buildLinkCoeffs(
    edgeIndices,
    edgeCount,
    nodeCount,
    config.linkStrengthMultiplier,
  );
  linkStrengthBase = coeffs.strength;
  linkBias = coeffs.bias;
  edgeWeightsStored =
    msg.edgeWeights && msg.edgeWeights.length >= edgeCount
      ? msg.edgeWeights
      : null;

  const weighted = buildPerEdgeLinkPhysics(
    edgeWeightsStored,
    edgeCount,
    config.edgeWeightInfluence,
    linkStrengthBase,
    effectiveLinkDistance,
  );
  linkStrength = weighted.strength;
  linkDistancePerEdge = weighted.linkDistancePerEdge;

  velocitiesX = new Float64Array(nodeCount);
  velocitiesY = new Float64Array(nodeCount);
  velocitiesZ = new Float64Array(nodeCount);

  running = true;
  tick();
}

function runLinkPasses(alpha: number): void {
  const li = Math.max(1, Math.floor(config.linkIterations));
  const d3Like = config.linkAttractionMode === 'd3_like';
  for (let pass = 0; pass < li; pass++) {
    applyLinkPassesSinglePass(
      d3Like,
      positions,
      edgeIndices,
      edgeCount,
      linkStrength,
      linkBias,
      linkDistancePerEdge,
      alpha,
      velocitiesX,
      velocitiesY,
      velocitiesZ,
    );
  }
}

/** Barnes–Hut repulsion accumulated into {@link velocitiesX} / Y / Z (d3 charge phase). */
function accumulateChargeForces(alpha: number): void {
  const theta2 = config.theta * config.theta;
  const distMinSq = config.distanceMin * config.distanceMin;

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

  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  const half = Math.max(extent * 0.5 + 1e-3, 1e-2);

  const root = makeOctreeNode(cx, cy, cz, half);
  for (let i = 0; i < nodeCount; i++) {
    const o = i * 3;
    insertBody(
      root,
      i,
      positions[o],
      positions[o + 1],
      positions[o + 2],
      effectiveCharge,
      0,
    );
  }

  const dvx = new Float64Array(nodeCount);
  const dvy = new Float64Array(nodeCount);
  const dvz = new Float64Array(nodeCount);

  for (let i = 0; i < nodeCount; i++) {
    const o = i * 3;
    barnesHutCharge(
      root,
      positions[o],
      positions[o + 1],
      positions[o + 2],
      i,
      alpha,
      theta2,
      distMinSq,
      dvx,
      dvy,
      dvz,
    );
  }

  for (let i = 0; i < nodeCount; i++) {
    velocitiesX[i] += dvx[i];
    velocitiesY[i] += dvy[i];
    velocitiesZ[i] += dvz[i];
  }
}

function tick(): void {
  if (!running) return;

  if (nodeCount === 0) {
    running = false;
    const positionsCopy = new Float32Array(positions);
    const done: ForceStabilizedResult = {
      type: 'stabilized',
      positions: positionsCopy,
      iteration: 0,
    };
    (self as unknown as Worker).postMessage(done, [positionsCopy.buffer]);
    return;
  }

  simAlpha += (config.alphaTarget - simAlpha) * config.alphaDecay;

  const velMult = 1 - config.velocityDecay;

  if (config.integrationMode === 'legacy') {
    accumulateChargeForces(simAlpha);
    runLinkPasses(simAlpha);
  } else {
    runLinkPasses(simAlpha);
    accumulateChargeForces(simAlpha);
  }

  applyCenterForce(
    positions,
    nodeCount,
    config.centerStrength,
    config.centerX,
    config.centerY,
    config.centerZ,
  );

  const maxV = config.maxVelocity;
  let energy = 0;
  for (let i = 0; i < nodeCount; i++) {
    velocitiesX[i] *= velMult;
    velocitiesY[i] *= velMult;
    velocitiesZ[i] *= velMult;

    const speed = Math.sqrt(
      velocitiesX[i] ** 2 + velocitiesY[i] ** 2 + velocitiesZ[i] ** 2,
    );
    if (config.clampVelocity && speed > maxV) {
      const scale = maxV / speed;
      velocitiesX[i] *= scale;
      velocitiesY[i] *= scale;
      velocitiesZ[i] *= scale;
    }

    const o = i * 3;
    positions[o] += velocitiesX[i];
    positions[o + 1] += velocitiesY[i];
    positions[o + 2] += velocitiesZ[i];

    energy += velocitiesX[i] ** 2 + velocitiesY[i] ** 2 + velocitiesZ[i] ** 2;
  }

  clampBBoxExtent(
    positions,
    velocitiesX,
    velocitiesY,
    velocitiesZ,
    nodeCount,
    extentBudget,
  );

  iteration++;

  const cooled = simAlpha < config.alphaMin;
  const exhausted = iteration >= config.maxIterations;
  // Ignore kinetic energy early while alpha is hot — premature stops froze bad sparse-shell layouts.
  const quiet =
    simAlpha < 0.08 &&
    iteration > 150 &&
    energy < 0.0005 * Math.max(1, nodeCount);

  if (cooled || exhausted || quiet) {
    running = false;
    if (config.recenterOnFinish) {
      recenter(
        positions,
        nodeCount,
        config.centerX,
        config.centerY,
        config.centerZ,
      );
    }
    const positionsCopy = new Float32Array(positions);
    const done: ForceStabilizedResult = {
      type: 'stabilized',
      positions: positionsCopy,
      iteration,
    };
    (self as unknown as Worker).postMessage(done, [positionsCopy.buffer]);
    return;
  }

  const positionsCopy = new Float32Array(positions);
  const msg: ForceTickResult = {
    type: 'tick',
    positions: positionsCopy,
    energy,
    iteration,
  };
  (self as unknown as Worker).postMessage(msg, [positionsCopy.buffer]);

  setTimeout(tick, 0);
}

self.onmessage = (e: MessageEvent<ForceRequest>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'start':
      running = false;
      start(msg);
      break;
    case 'stop':
      running = false;
      break;
    case 'config':
      if (msg.config) {
        Object.assign(config, msg.config);
        const ldChanged = msg.config.linkDistance !== undefined;
        const chChanged = msg.config.chargeStrength !== undefined;
        const fsChanged = msg.config.forceScaleMode !== undefined;
        const ewInfChanged = msg.config.edgeWeightInfluence !== undefined;

        if (ldChanged || chChanged || fsChanged) {
          recomputeEffectiveLinkPhysics();
        }
        if (ldChanged) {
          recomputeExtentBudgetBaseFromTopology();
          recomputeExtentBudget();
          if (running) {
            simAlpha = Math.max(simAlpha, config.alpha * 0.28);
          }
        }

        const rebuildWeighted =
          ewInfChanged || ldChanged || chChanged || fsChanged;
        if (rebuildWeighted && edgeCount > 0) {
          const w = buildPerEdgeLinkPhysics(
            edgeWeightsStored,
            edgeCount,
            config.edgeWeightInfluence,
            linkStrengthBase,
            effectiveLinkDistance,
          );
          linkStrength = w.strength;
          linkDistancePerEdge = w.linkDistancePerEdge;
        }
      }
      break;
  }
};
