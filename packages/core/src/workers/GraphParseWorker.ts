/**
 * Worker entry point for parsing graph data off the main thread.
 *
 * Supports:
 *  - CSV (positions + optional edges; optional `label` column on node CSV → names, else `n0`, `n1`, …)
 *  - JSON ({ nodes: [...], edges?: [...] }) — positions from file
 *  - JSON ({ edges, nodeCount?, labels? }) — topology-only seed; optional `labels`
 *    and per-edge optional `weight` (default 1). ParseResult.layoutSuggested is true.
 *
 * All output is TypedArrays transferred via Transferable for zero-copy.
 */

export interface ParseRequest {
  type: 'csv' | 'json';
  data: string;
}

export interface ParseResult {
  positions: Float32Array;
  nodeCount: number;
  edgeIndices: Uint32Array;
  edgeCount: number;
  colors?: Uint8Array;
  sizes?: Float32Array;
  /**
   * True when positions were synthesized from edges alone. Host apps should run
   * force-directed layout so structure (clusters, hubs) emerges.
   */
  layoutSuggested?: boolean;
  /** Per-node text; index aligns with positions / node indices (optional). */
  labels?: string[];
  /** Per-edge weight (length = edgeCount); default 1 when omitted in JSON. */
  edgeWeights?: Float32Array;
}

export interface ParseError {
  error: string;
}

export type WorkerResponse = ParseResult | ParseError;

function isParseResult(r: WorkerResponse): r is ParseResult {
  return 'positions' in r;
}

/** Build `labels[i]` for `i ∈ [0, nodeCount)`, padding with `""`. */
function normalizeLabels(
  raw: unknown,
  nodeCount: number,
): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const v = raw[i];
    out.push(v == null ? '' : String(v));
  }
  return out;
}

function fallbackNodeLabels(nodeCount: number): string[] {
  return Array.from({ length: nodeCount }, (_, i) => `n${i}`);
}

function resolveLabelsFromGraph(
  graph: GraphJsonDocument,
  nodeCount: number,
  nodes: GraphJsonNode[] | undefined,
): string[] {
  const fromTop = normalizeLabels(graph.labels, nodeCount);
  if (fromTop?.some((s) => s.length > 0)) return fromTop;

  if (nodes) {
    const perNode = nodes.map((n) =>
      typeof n.label === 'string' ? n.label : '',
    );
    while (perNode.length < nodeCount) perNode.push('');
    const trimmed = perNode.slice(0, nodeCount);
    if (trimmed.some((s) => s.length > 0)) return trimmed;
  }

  return fallbackNodeLabels(nodeCount);
}

/** Flatten JSON edges to indices + weights (invalid endpoints skipped). */
function flattenJSONEdges(edges: GraphJsonEdge[]): {
  edgeIndices: Uint32Array;
  edgeWeights: Float32Array;
  edgeCount: number;
} {
  const cap = edges.length;
  const tmpIdx = new Uint32Array(cap * 2);
  const tmpW = new Float32Array(cap);
  let edgeCount = 0;
  for (let i = 0; i < cap; i++) {
    const e = edges[i];
    const s = e.source;
    const t = e.target;
    if (!Number.isFinite(s) || !Number.isFinite(t)) continue;
    tmpIdx[edgeCount * 2] = s;
    tmpIdx[edgeCount * 2 + 1] = t;
    const w = e.weight;
    tmpW[edgeCount] = typeof w === 'number' && Number.isFinite(w) ? w : 1;
    edgeCount++;
  }
  return {
    edgeIndices: tmpIdx.subarray(0, edgeCount * 2),
    edgeWeights: tmpW.subarray(0, edgeCount),
    edgeCount,
  };
}

function parseCSV(csv: string): ParseResult {
  const lines = csv.split('\n');
  let headerLine = 0;
  while (headerLine < lines.length && lines[headerLine].trim() === '') {
    headerLine++;
  }

  const header = lines[headerLine].trim().toLowerCase().split(',');
  const xIdx = header.indexOf('x');
  const yIdx = header.indexOf('y');
  const zIdx = header.indexOf('z');
  const srcIdx = header.indexOf('source');
  const dstIdx = header.indexOf('target');

  const isEdgeCSV = srcIdx >= 0 && dstIdx >= 0;
  const isNodeCSV = xIdx >= 0 && yIdx >= 0;

  if (isNodeCSV) {
    const labelIdx = header.indexOf('label');
    const rows = lines.slice(headerLine + 1).filter((l) => l.trim() !== '');
    const positions = new Float32Array(rows.length * 3);
    const labels: string[] = [];
    let nodeCount = 0;

    for (const row of rows) {
      const cols = row.split(',');
      const x = parseFloat(cols[xIdx]);
      const y = parseFloat(cols[yIdx]);
      const z = zIdx >= 0 ? parseFloat(cols[zIdx]) : 0;
      if (isNaN(x) || isNaN(y)) continue;
      positions[nodeCount * 3] = x;
      positions[nodeCount * 3 + 1] = y;
      positions[nodeCount * 3 + 2] = z;
      let lbl = '';
      if (labelIdx >= 0 && cols[labelIdx] !== undefined) {
        lbl = String(cols[labelIdx]).trim();
      }
      labels.push(lbl.length > 0 ? lbl : `n${nodeCount}`);
      nodeCount++;
    }

    return {
      positions: positions.subarray(0, nodeCount * 3),
      nodeCount,
      edgeIndices: new Uint32Array(0),
      edgeCount: 0,
      labels,
    };
  }

  if (isEdgeCSV) {
    const weightIdx = header.indexOf('weight');
    const rows = lines.slice(headerLine + 1).filter((l) => l.trim() !== '');
    const edgeIndices = new Uint32Array(rows.length * 2);
    const edgeWeights = new Float32Array(rows.length);
    let edgeCount = 0;

    for (const row of rows) {
      const cols = row.split(',');
      const s = parseInt(cols[srcIdx], 10);
      const t = parseInt(cols[dstIdx], 10);
      if (isNaN(s) || isNaN(t)) continue;
      edgeIndices[edgeCount * 2] = s;
      edgeIndices[edgeCount * 2 + 1] = t;
      let w = 1;
      if (weightIdx >= 0 && cols[weightIdx] !== undefined) {
        const parsed = parseFloat(cols[weightIdx]);
        if (Number.isFinite(parsed)) w = parsed;
      }
      edgeWeights[edgeCount] = w;
      edgeCount++;
    }

    return {
      positions: new Float32Array(0),
      nodeCount: 0,
      edgeIndices: edgeIndices.subarray(0, edgeCount * 2),
      edgeCount,
      edgeWeights: new Float32Array(edgeWeights.subarray(0, edgeCount)),
    };
  }

  throw new Error('CSV must have x,y[,z] columns or source,target columns');
}

export interface GraphJsonNode {
  x: number;
  y: number;
  z?: number;
  label?: string;
}

export interface GraphJsonEdge {
  source: number;
  target: number;
  weight?: number;
}

/** Wire format for `parseGraphAsync('json', text)` after `JSON.parse`. */
export interface GraphJsonDocument {
  nodes?: GraphJsonNode[];
  edges?: GraphJsonEdge[];
  /** When `nodes` is omitted, number of nodes (must cover all edge endpoint indices). */
  nodeCount?: number;
  /** Length should match node count; shorter arrays are padded, longer truncated. */
  labels?: string[];
}

/** Union-find components from edge list (isolates are singleton components). */
function labelConnectedComponents(
  nodeCount: number,
  edges: Uint32Array,
  edgeCount: number,
): { comp: Uint32Array; numComps: number } {
  const parent = new Uint32Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) parent[i] = i;

  const find = (a: number): number => {
    const p = parent[a];
    if (p !== a) {
      parent[a] = find(p);
      return parent[a];
    }
    return a;
  };

  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let e = 0; e < edgeCount; e++) {
    union(edges[e * 2], edges[e * 2 + 1]);
  }

  const comp = new Uint32Array(nodeCount);
  const rootToId = new Map<number, number>();
  let numComps = 0;
  for (let i = 0; i < nodeCount; i++) {
    const r = find(i);
    let id = rootToId.get(r);
    if (id === undefined) {
      id = numComps++;
      rootToId.set(r, id);
    }
    comp[i] = id;
  }

  return { comp, numComps };
}

function countNodesPerComponent(
  comp: Uint32Array,
  numComps: number,
): Uint32Array {
  const sizes = new Uint32Array(numComps);
  for (let i = 0; i < comp.length; i++) {
    sizes[comp[i]]++;
  }
  return sizes;
}

function computeDegrees(
  nodeCount: number,
  edges: Uint32Array,
  edgeCount: number,
): Uint32Array {
  const d = new Uint32Array(nodeCount);
  for (let e = 0; e < edgeCount; e++) {
    d[edges[e * 2]]++;
    d[edges[e * 2 + 1]]++;
  }
  return d;
}

/** Deterministic ∈ [0, 1) from mixed integers (surrogate for RNG in worker). */
function hashUnitFloat(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
  h ^= Math.imul((b + 37) ^ (c * 31), 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 15;
  return ((h >>> 0) & 0xffffffff) / 0x100000000;
}

/** Axis-aligned jitter in approximately [-0.5, 0.5]³ (breaks spherical shells). */
function boxTriplet(
  i: number,
  cid: number,
  salt: number,
): [number, number, number] {
  return [
    hashUnitFloat(i, cid, salt) - 0.5,
    hashUnitFloat(i, cid, salt + 97) - 0.5,
    hashUnitFloat(i, cid, salt + 193) - 0.5,
  ];
}

/**
 * Translate centroid to origin and uniformly scale so the **axis-aligned bbox**
 * largest edge equals `2 × targetRadius` (fits inside `[-targetRadius, targetRadius]³`),
 * preserving aspect ratio instead of snapping to a circumscribed sphere.
 */
function normalizeSeedExtent(
  positions: Float32Array,
  nodeCount: number,
  targetRadius: number,
): void {
  if (nodeCount <= 0 || !(targetRadius > 0)) return;

  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < nodeCount; i++) {
    const o = i * 3;
    cx += positions[o];
    cy += positions[o + 1];
    cz += positions[o + 2];
  }
  const invn = 1 / nodeCount;
  cx *= invn;
  cy *= invn;
  cz *= invn;

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < nodeCount; i++) {
    const o = i * 3;
    const x = positions[o] - cx;
    const y = positions[o + 1] - cy;
    const z = positions[o + 2] - cz;
    positions[o] = x;
    positions[o + 1] = y;
    positions[o + 2] = z;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  if (extent < 1e-8) return;

  const scale = (2 * targetRadius) / extent;
  for (let i = 0; i < nodeCount; i++) {
    const o = i * 3;
    positions[o] *= scale;
    positions[o + 1] *= scale;
    positions[o + 2] *= scale;
  }
}

/**
 * Initial positions from connectivity only: disjoint components sit in separate
 * regions; within a component, **high-degree nodes start nearer** the component
 * anchor so hubs are slightly centralized. Offsets use **axis-aligned hash jitter**
 * (not radial shells) so the seed is not an implicit sphere.
 * Extent is normalized so the bbox largest edge is ~18 (`targetRadius` 9).
 */
function topologyAwareSeedPositions(
  nodeCount: number,
  edges: Uint32Array,
  edgeCount: number,
): Float32Array {
  const positions = new Float32Array(nodeCount * 3);
  if (nodeCount === 0) return positions;

  const { comp, numComps } = labelConnectedComponents(
    nodeCount,
    edges,
    edgeCount,
  );
  const compSizes = countNodesPerComponent(comp, numComps);
  const degree = computeDegrees(nodeCount, edges, edgeCount);
  const maxDegComp = new Uint32Array(numComps);
  for (let i = 0; i < nodeCount; i++) {
    const c = comp[i];
    const d = degree[i];
    if (d > maxDegComp[c]) maxDegComp[c] = d;
  }

  const centers = new Float32Array(numComps * 3);
  const R = Math.max(120, Math.cbrt(nodeCount) * 70);
  if (numComps === 1) {
    centers[0] = 0;
    centers[1] = 0;
    centers[2] = 0;
  } else {
    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    const twoPi = 2 * Math.PI;
    for (let k = 0; k < numComps; k++) {
      const t = (k + 0.5) / numComps;
      const inclination = Math.acos(1 - 2 * t);
      const azimuth = twoPi * goldenRatio * k;
      const sinInc = Math.sin(inclination);
      centers[k * 3] = R * sinInc * Math.cos(azimuth);
      centers[k * 3 + 1] = R * sinInc * Math.sin(azimuth);
      centers[k * 3 + 2] = R * Math.cos(inclination);
    }
  }

  for (let i = 0; i < nodeCount; i++) {
    const cid = comp[i];
    const cx = centers[cid * 3];
    const cy = centers[cid * 3 + 1];
    const cz = centers[cid * 3 + 2];
    const nInC = Math.max(1, compSizes[cid]);
    const localSpread = Math.max(10, Math.sqrt(nInC) * 5);

    const md = Math.max(1, maxDegComp[cid]);
    const hubStrength = degree[i] / md;
    const radial = localSpread * (0.06 + 0.94 * (1 - Math.sqrt(hubStrength)));

    const jmag = localSpread * 0.18;

    const [bx, by, bz] = boxTriplet(i, cid, 1);
    const [jx, jy, jz] = boxTriplet(i, cid, 5003);

    positions[i * 3] = cx + bx * radial + jx * jmag;
    positions[i * 3 + 1] = cy + by * radial + jy * jmag;
    positions[i * 3 + 2] = cz + bz * radial + jz * jmag;
  }

  const LAYOUT_SEED_RADIUS = 9;
  normalizeSeedExtent(positions, nodeCount, LAYOUT_SEED_RADIUS);

  return positions;
}

function parseJSON(raw: string): ParseResult {
  const graph: GraphJsonDocument = JSON.parse(raw);

  const hasNodes = Array.isArray(graph.nodes);
  const hasEdges = Array.isArray(graph.edges);

  if (hasNodes && graph.nodes) {
    const nodeCount = graph.nodes.length;
    const positions = new Float32Array(nodeCount * 3);

    for (let i = 0; i < nodeCount; i++) {
      const n = graph.nodes[i];
      positions[i * 3] = n.x;
      positions[i * 3 + 1] = n.y;
      positions[i * 3 + 2] = n.z ?? 0;
    }

    let edgeIndices = new Uint32Array(0);
    let edgeCount = 0;
    let edgeWeights: Float32Array | undefined;

    if (hasEdges && graph.edges) {
      const flat = flattenJSONEdges(graph.edges);
      edgeIndices = new Uint32Array(flat.edgeIndices);
      edgeCount = flat.edgeCount;
      edgeWeights =
        flat.edgeCount > 0 ? new Float32Array(flat.edgeWeights) : undefined;
    }

    const labels = resolveLabelsFromGraph(graph, nodeCount, graph.nodes);

    return {
      positions,
      nodeCount,
      edgeIndices,
      edgeCount,
      labels,
      edgeWeights,
    };
  }

  if (hasEdges && graph.edges && graph.edges.length >= 0) {
    let nodeCount =
      typeof graph.nodeCount === 'number' && Number.isFinite(graph.nodeCount)
        ? Math.max(0, Math.floor(graph.nodeCount))
        : 0;

    const flat = flattenJSONEdges(graph.edges);
    const edgeCount = flat.edgeCount;
    let maxEndpoint = -1;
    for (let i = 0; i < edgeCount; i++) {
      maxEndpoint = Math.max(
        maxEndpoint,
        flat.edgeIndices[i * 2],
        flat.edgeIndices[i * 2 + 1],
      );
    }

    const inferred = maxEndpoint >= 0 ? maxEndpoint + 1 : 0;
    if (nodeCount < inferred) nodeCount = inferred;

    if (nodeCount <= 0) {
      throw new Error(
        'JSON without nodes must include edge endpoints or nodeCount > 0',
      );
    }

    const edgeIndices = new Uint32Array(flat.edgeIndices);
    const edgeWeights =
      flat.edgeCount > 0 ? new Float32Array(flat.edgeWeights) : undefined;
    const positions = topologyAwareSeedPositions(
      nodeCount,
      edgeIndices,
      edgeCount,
    );

    const labels = resolveLabelsFromGraph(graph, nodeCount, undefined);

    return {
      positions,
      nodeCount,
      edgeIndices,
      edgeCount,
      layoutSuggested: true,
      labels,
      edgeWeights,
    };
  }

  throw new Error(
    'JSON must have a "nodes" array or an "edges" array (connections-only)',
  );
}

// Worker bootstrap — only runs when loaded as a Worker script.
// Uses `self` (which is `globalThis` inside a Worker).
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  self.onmessage = (e: MessageEvent) => {
    try {
      const req = e.data as ParseRequest;
      let result: ParseResult;
      switch (req.type) {
        case 'csv':
          result = parseCSV(req.data);
          break;
        case 'json':
          result = parseJSON(req.data);
          break;
        default:
          throw new Error(`Unknown parse type: ${req.type}`);
      }

      const transferables: Transferable[] = [
        result.positions.buffer,
        result.edgeIndices.buffer,
      ];
      if (result.colors) transferables.push(result.colors.buffer);
      if (result.sizes) transferables.push(result.sizes.buffer);
      if (result.edgeWeights && result.edgeWeights.byteLength > 0) {
        transferables.push(result.edgeWeights.buffer);
      }

      self.postMessage(result, { transfer: transferables });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      self.postMessage({ error: msg } satisfies ParseError);
    }
  };
}

export { isParseResult };
