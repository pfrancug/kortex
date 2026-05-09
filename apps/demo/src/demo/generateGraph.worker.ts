/**
 * Web Worker for off-thread graph generation.
 * Mirrors the logic in generateGraph.ts but runs without blocking the UI.
 */

export interface GenWorkerRequest {
  nodeCount: number;
  radius: number;
  edgesPerNode: number;
}

export interface GenWorkerResponse {
  positions: Float32Array;
  colors: Uint8Array;
  sizes: Float32Array;
  labels: string[];
  edgeIndices: Uint32Array;
  elapsedMs: number;
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

function generate(
  nodeCount: number,
  radius: number,
  edgesPerNode: number,
): GenWorkerResponse {
  const t0 = performance.now();

  const positions = new Float32Array(nodeCount * 3);
  const colors = new Uint8Array(nodeCount * 4);
  const sizes = new Float32Array(nodeCount);

  for (let i = 0; i < nodeCount; i++) {
    const x = (2 * Math.random() - 1) * radius;
    const y = (2 * Math.random() - 1) * radius;
    const z = (2 * Math.random() - 1) * radius;

    const o3 = i * 3;
    positions[o3] = x;
    positions[o3 + 1] = y;
    positions[o3 + 2] = z;

    const azimuthHue = ((Math.atan2(y, x) + Math.PI) / (2 * Math.PI)) * 240;
    const hue =
      (azimuthHue + (z / Math.max(radius, 1e-6) + 1) * 30 + 720) % 360;
    const [cr, cg, cb] = hslToRgb(hue / 360, 0.7, 0.55);
    const o4 = i * 4;
    colors[o4] = cr;
    colors[o4 + 1] = cg;
    colors[o4 + 2] = cb;
    colors[o4 + 3] = 255;

    sizes[i] = (0.04 + Math.random() * 0.06) * 10;
  }

  // Spatial hash grid
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
  for (let i = 0; i < nodeCount; i++) {
    labels[i] = `N${i}`;
  }

  const edgeIndices = new Uint32Array(edges);
  const elapsedMs = performance.now() - t0;

  return { positions, colors, sizes, labels, edgeIndices, elapsedMs };
}

self.onmessage = (e: MessageEvent<GenWorkerRequest>) => {
  const { nodeCount, radius, edgesPerNode } = e.data;
  const result = generate(nodeCount, radius, edgesPerNode);
  (self as unknown as Worker).postMessage(result, [
    result.positions.buffer,
    result.colors.buffer,
    result.sizes.buffer,
    result.edgeIndices.buffer,
  ]);
};
