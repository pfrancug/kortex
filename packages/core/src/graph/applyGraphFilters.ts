import type { GraphStore } from './GraphStore';

/**
 * Filter visible nodes and edges like a co-occurrence graph UI: keep edges whose
 * weight is ≥ minWeight, then keep nodes with degree ≥ minDegree on the **current**
 * visible edge set. Repeats until stable so a node cannot stay visible after all
 * its incident edges are dropped (e.g. every neighbor failed the degree cut).
 *
 * Nodes with zero incident visible edges are always hidden.
 *
 * @param edgeWeights - Per-edge weight (length ≥ edgeCount). `null` or too-short array skips the
 *   weight gate (all edges pass), matching graphs with no meaningful strength metadata.
 */
export function applyDegreeWeightFilters(
  graph: GraphStore,
  edgeWeights: Float32Array | null,
  minDegree: number,
  minWeight: number,
): void {
  const nc = graph.nodeCount;
  const ec = graph.edgeCount;
  if (nc === 0) return;

  if (ec === 0) {
    const nodeVis = new Uint8Array(nc);
    nodeVis.fill(1);
    graph.setNodeVisibility(nodeVis);
    return;
  }

  const minD = Math.max(0, Math.floor(minDegree));
  const minW = Math.max(0, minWeight);

  const ei = graph.edgeIndices;

  const weightsOk = edgeWeights !== null && edgeWeights.length >= ec;
  const edgePassesWeight = new Uint8Array(ec);
  if (!weightsOk) {
    edgePassesWeight.fill(1);
  } else {
    for (let i = 0; i < ec; i++) {
      let w = edgeWeights[i];
      if (!Number.isFinite(w) || w <= 0) w = 1;
      edgePassesWeight[i] = w >= minW ? 1 : 0;
    }
  }

  const deg = new Uint32Array(nc);
  for (let i = 0; i < ec; i++) {
    if (!edgePassesWeight[i]) continue;
    deg[ei[i * 2]]++;
    deg[ei[i * 2 + 1]]++;
  }

  const nodeVis = new Uint8Array(nc);
  for (let i = 0; i < nc; i++) {
    nodeVis[i] = deg[i] >= minD ? 1 : 0;
  }

  const edgeVis = new Uint8Array(ec);
  const liveDeg = new Uint32Array(nc);

  for (let iter = 0; iter <= nc + 2; iter++) {
    for (let i = 0; i < ec; i++) {
      const a = ei[i * 2];
      const b = ei[i * 2 + 1];
      edgeVis[i] = edgePassesWeight[i] && nodeVis[a] && nodeVis[b] ? 1 : 0;
    }

    liveDeg.fill(0);
    for (let i = 0; i < ec; i++) {
      if (!edgeVis[i]) continue;
      liveDeg[ei[i * 2]]++;
      liveDeg[ei[i * 2 + 1]]++;
    }

    let changed = false;
    for (let i = 0; i < nc; i++) {
      const d = liveDeg[i];
      const nv = d >= minD && d > 0 ? 1 : 0;
      if (nv !== nodeVis[i]) changed = true;
      nodeVis[i] = nv;
    }

    if (!changed) break;
  }

  for (let i = 0; i < ec; i++) {
    const a = ei[i * 2];
    const b = ei[i * 2 + 1];
    edgeVis[i] = edgePassesWeight[i] && nodeVis[a] && nodeVis[b] ? 1 : 0;
  }

  graph.setNodeVisibility(nodeVis);
  graph.setEdgeVisibility(edgeVis);
}
