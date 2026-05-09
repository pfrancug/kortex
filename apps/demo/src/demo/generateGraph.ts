export interface GraphData {
  positions: Float32Array;
  colors: Uint8Array;
  sizes: Float32Array;
  labels: string[];
  edgeIndices: Uint32Array;
}

/**
 * Uniform random positions in `[-radius, radius]³` (axis-aligned box, not a ball).
 * Force layout and topology seeds stay structured instead of collapsing to a spherical shell.
 */
export function generateBoxCloud(
  count: number,
  radius: number,
): { positions: Float32Array; colors: Uint8Array; sizes: Float32Array } {
  const positions = new Float32Array(count * 3);
  const colors = new Uint8Array(count * 4);
  const sizes = new Float32Array(count);

  const inv = 1 / Math.max(radius, 1e-6);

  for (let i = 0; i < count; i++) {
    const x = (2 * Math.random() - 1) * radius;
    const y = (2 * Math.random() - 1) * radius;
    const z = (2 * Math.random() - 1) * radius;

    const o3 = i * 3;
    positions[o3] = x;
    positions[o3 + 1] = y;
    positions[o3 + 2] = z;

    const azimuthHue = ((Math.atan2(y, x) + Math.PI) / (2 * Math.PI)) * 240;
    const hue = (azimuthHue + (z * inv + 1) * 30 + 720) % 360;
    const [cr, cg, cb] = hslToRgb(hue / 360, 0.7, 0.55);
    const o4 = i * 4;
    colors[o4] = cr;
    colors[o4 + 1] = cg;
    colors[o4 + 2] = cb;
    colors[o4 + 3] = 255;

    sizes[i] = (0.04 + Math.random() * 0.06) * 10;
  }

  return { positions, colors, sizes };
}

/** @deprecated Use {@link generateBoxCloud}; kept for older references. */
export const generateSphereCloud = generateBoxCloud;

/**
 * Generate a spatial graph: 3D box cloud + edges between nearby nodes.
 * Uses a 3D grid hash to find neighbors efficiently.
 * `edgesPerNode` controls how many neighbors each node connects to.
 */
export function generateRandomGraph(
  nodeCount: number,
  radius: number,
  edgesPerNode: number,
): GraphData {
  const { positions, colors, sizes } = generateBoxCloud(nodeCount, radius);

  // Spatial hash grid for neighbor lookup
  const divisions = 16;
  const cellSize = (radius * 2) / divisions;
  const grid = new Map<number, number[]>();

  const cellKey = (cx: number, cy: number, cz: number): number =>
    (cx + divisions) * (divisions * 2 + 1) * (divisions * 2 + 1) +
    (cy + divisions) * (divisions * 2 + 1) +
    (cz + divisions);

  const cellOf = (i: number): [number, number, number] => {
    const o = i * 3;
    return [
      Math.floor((positions[o] + radius) / cellSize) | 0,
      Math.floor((positions[o + 1] + radius) / cellSize) | 0,
      Math.floor((positions[o + 2] + radius) / cellSize) | 0,
    ];
  };

  for (let i = 0; i < nodeCount; i++) {
    const [cx, cy, cz] = cellOf(i);
    const key = cellKey(cx, cy, cz);
    let bucket = grid.get(key);
    if (!bucket) {
      bucket = [];
      grid.set(key, bucket);
    }
    bucket.push(i);
  }

  const edges: number[] = [];
  const edgeSet = new Set<bigint>();

  for (let i = 0; i < nodeCount; i++) {
    const [cx, cy, cz] = cellOf(i);
    const ox = i * 3;
    const px = positions[ox],
      py = positions[ox + 1],
      pz = positions[ox + 2];

    // Gather candidates from neighboring cells
    const candidates: { idx: number; dist2: number }[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = grid.get(cellKey(cx + dx, cy + dy, cz + dz));
          if (!bucket) continue;
          for (const j of bucket) {
            if (j === i) continue;
            const oj = j * 3;
            const ddx = positions[oj] - px;
            const ddy = positions[oj + 1] - py;
            const ddz = positions[oj + 2] - pz;
            candidates.push({
              idx: j,
              dist2: ddx * ddx + ddy * ddy + ddz * ddz,
            });
          }
        }
      }
    }

    // Sort by distance, pick closest k
    candidates.sort((a, b) => a.dist2 - b.dist2);
    let added = 0;
    for (let c = 0; c < candidates.length && added < edgesPerNode; c++) {
      const j = candidates[c].idx;
      const lo = Math.min(i, j);
      const hi = Math.max(i, j);
      const key = (BigInt(lo) << 20n) | BigInt(hi);
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push(lo, hi);
      added++;
    }
  }

  const labels: string[] = new Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) labels[i] = `N${i}`;

  return {
    positions,
    colors,
    sizes,
    labels,
    edgeIndices: new Uint32Array(edges),
  };
}

/**
 * Async graph generation — runs in a Web Worker so the main thread stays
 * responsive. Returns a promise that resolves with the graph data and
 * generation time.
 */
export function generateGraphAsync(
  nodeCount: number,
  radius: number,
  edgesPerNode: number,
): Promise<GraphData & { elapsedMs: number }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./generateGraph.worker.ts', import.meta.url),
      { type: 'module' },
    );
    worker.onmessage = (e: MessageEvent) => {
      worker.terminate();
      resolve(e.data as GraphData & { elapsedMs: number });
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error(err.message));
    };
    worker.postMessage({ nodeCount, radius, edgesPerNode });
  });
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  const sector = (h * 6) | 0;
  switch (sector % 6) {
    case 0:
      r = c;
      g = x;
      break;
    case 1:
      r = x;
      g = c;
      break;
    case 2:
      g = c;
      b = x;
      break;
    case 3:
      g = x;
      b = c;
      break;
    case 4:
      r = x;
      b = c;
      break;
    case 5:
      r = c;
      b = x;
      break;
  }
  return [
    ((r + m) * 255 + 0.5) | 0,
    ((g + m) * 255 + 0.5) | 0,
    ((b + m) * 255 + 0.5) | 0,
  ];
}
