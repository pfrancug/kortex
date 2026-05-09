/**
 * Serialize graph arrays as JSON that `parseGraphAsync('json', …)` accepts:
 * `labels`, `nodes` ({ x, y, z }), `edges`. Saved positions skip auto-layout on reload.
 */

export interface ExportGraphJsonArgs {
  positions: Float32Array;
  nodeCount: number;
  edgeIndices: Uint32Array;
  edgeCount: number;
  labels: string[];
  edgeWeights: Float32Array | null;
}

function finiteOr0(x: number): number {
  return Number.isFinite(x) ? x : 0;
}

export function buildPositionedGraphJson(a: ExportGraphJsonArgs): string {
  const { positions, nodeCount, edgeIndices, edgeCount, labels, edgeWeights } =
    a;

  const labelRow: string[] = [];
  for (let i = 0; i < nodeCount; i++) {
    labelRow.push(labels[i] ?? '');
  }

  const nodes: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const o = i * 3;
    nodes.push({
      x: finiteOr0(positions[o]),
      y: finiteOr0(positions[o + 1]),
      z: finiteOr0(positions[o + 2]),
    });
  }

  const hasWeights = edgeWeights !== null && edgeWeights.length >= edgeCount;

  const edges: { source: number; target: number; weight?: number }[] = [];
  for (let i = 0; i < edgeCount; i++) {
    const s = edgeIndices[i * 2];
    const t = edgeIndices[i * 2 + 1];
    const e: { source: number; target: number; weight?: number } = {
      source: s,
      target: t,
    };
    if (hasWeights) {
      let w = edgeWeights![i];
      if (!Number.isFinite(w) || w <= 0) w = 1;
      e.weight = w;
    }
    edges.push(e);
  }

  return JSON.stringify({ labels: labelRow, nodes, edges }, null, 2);
}

export function triggerGraphJsonDownload(
  json: string,
  filenamePrefix: string,
): void {
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.href = url;
  a.download = `${filenamePrefix}-${stamp}.json`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
