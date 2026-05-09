/**
 * Grid-based multi-level node clustering for LOD.
 *
 * Pre-computes cluster assignments at several resolution levels.
 * At render time the caller picks a level based on camera distance
 * and hides individual nodes, showing cluster representatives instead.
 *
 * Strictly visual — the underlying graph data is never mutated.
 */

export interface ClusterLevel {
  /** Grid cell size used for this level. */
  cellSize: number;
  /** Number of clusters at this level. */
  clusterCount: number;
  /** Per-node cluster assignment (nodeIndex → clusterIndex). */
  assignments: Uint32Array;
  /** Cluster centroids (clusterIndex * 3 → x,y,z). */
  centroids: Float32Array;
  /** Node count per cluster (for sizing the super-node). */
  memberCounts: Uint32Array;
}

const MAX_LEVELS = 6;

export class ClusterLOD {
  readonly levels: ClusterLevel[] = [];

  /**
   * Build cluster levels from node positions.
   * Each successive level doubles the cell size.
   *
   * @param baseCellSize - cell size for the finest (first) cluster level
   */
  build(
    positions: Float32Array,
    nodeCount: number,
    baseCellSize: number,
  ): void {
    this.levels.length = 0;

    let cellSize = baseCellSize;
    for (let lv = 0; lv < MAX_LEVELS; lv++) {
      const level = buildLevel(positions, nodeCount, cellSize);
      this.levels.push(level);
      if (level.clusterCount <= 1) break;
      cellSize *= 2;
    }
  }

  /**
   * Choose a cluster level based on camera distance.
   * Returns -1 if no clustering is needed (show all original nodes).
   */
  pickLevel(cameraDistance: number, baseCellSize: number): number {
    // Heuristic: activate clustering when camera is far enough that
    // individual nodes at baseCellSize would be sub-pixel.
    const threshold = baseCellSize * 20;
    if (cameraDistance < threshold) return -1;

    for (let i = 0; i < this.levels.length; i++) {
      if (this.levels[i].cellSize * 20 > cameraDistance) return i;
    }
    return this.levels.length - 1;
  }

  /**
   * Apply clustering: writes a visibility mask that hides individual nodes
   * and returns cluster data for rendering super-nodes.
   *
   * @returns cluster positions, sizes, and colors for the selected level,
   *          or null if no clustering is active.
   */
  apply(
    levelIndex: number,
    nodeColors: Uint8Array,
    nodeCount: number,
    nodeVisibilityOut: Uint8Array,
  ): {
    positions: Float32Array;
    sizes: Float32Array;
    colors: Uint8Array;
  } | null {
    if (levelIndex < 0 || levelIndex >= this.levels.length) return null;

    const level = this.levels[levelIndex];
    const cc = level.clusterCount;

    // Hide all original nodes
    nodeVisibilityOut.fill(0, 0, nodeCount);

    const sizes = new Float32Array(cc);
    const colors = new Uint8Array(cc * 4);
    const colorAccum = new Float64Array(cc * 4);

    for (let i = 0; i < nodeCount; i++) {
      const ci = level.assignments[i];
      const co = ci * 4;
      const no = i * 4;
      colorAccum[co] += nodeColors[no];
      colorAccum[co + 1] += nodeColors[no + 1];
      colorAccum[co + 2] += nodeColors[no + 2];
      colorAccum[co + 3] += nodeColors[no + 3];
    }

    for (let c = 0; c < cc; c++) {
      const mc = level.memberCounts[c];
      sizes[c] = Math.max(1.0, Math.sqrt(mc) * 0.5);
      const co = c * 4;
      colors[co] = Math.round(colorAccum[co] / mc);
      colors[co + 1] = Math.round(colorAccum[co + 1] / mc);
      colors[co + 2] = Math.round(colorAccum[co + 2] / mc);
      colors[co + 3] = Math.round(colorAccum[co + 3] / mc);
    }

    return {
      positions: level.centroids.slice(0, cc * 3),
      sizes,
      colors,
    };
  }
}

function buildLevel(
  positions: Float32Array,
  nodeCount: number,
  cellSize: number,
): ClusterLevel {
  const invCell = 1.0 / cellSize;
  const cellMap = new Map<string, number>();
  const assignments = new Uint32Array(nodeCount);

  const centroidsAccum: number[] = [];
  const memberCounts: number[] = [];
  let clusterCount = 0;

  for (let i = 0; i < nodeCount; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];

    const cx = Math.floor(x * invCell);
    const cy = Math.floor(y * invCell);
    const cz = Math.floor(z * invCell);
    const key = `${cx},${cy},${cz}`;

    let ci = cellMap.get(key);
    if (ci === undefined) {
      ci = clusterCount++;
      cellMap.set(key, ci);
      centroidsAccum.push(0, 0, 0);
      memberCounts.push(0);
    }

    assignments[i] = ci;
    centroidsAccum[ci * 3] += x;
    centroidsAccum[ci * 3 + 1] += y;
    centroidsAccum[ci * 3 + 2] += z;
    memberCounts[ci]++;
  }

  const centroids = new Float32Array(clusterCount * 3);
  const counts = new Uint32Array(clusterCount);
  for (let c = 0; c < clusterCount; c++) {
    const mc = memberCounts[c];
    counts[c] = mc;
    centroids[c * 3] = centroidsAccum[c * 3] / mc;
    centroids[c * 3 + 1] = centroidsAccum[c * 3 + 1] / mc;
    centroids[c * 3 + 2] = centroidsAccum[c * 3 + 2] / mc;
  }

  return {
    cellSize,
    clusterCount,
    assignments,
    centroids,
    memberCounts: counts,
  };
}
