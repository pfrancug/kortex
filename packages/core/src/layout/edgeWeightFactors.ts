/**
 * Per-edge spring tuning from optional edge weights (Phase C).
 * Used by {@link ./ForceWorker.ts}; kept separate so tests avoid loading the worker bootstrap.
 */

/** β in strength ∝ w^β and target length ∝ w^{-β}. Default √w — see docs/TODO.md (force layout open questions). */
export const EDGE_WEIGHT_EXPONENT = 0.5;

export type EdgeWeightInfluenceArg =
  | 'off'
  | 'linkStrength'
  | 'linkDistance'
  | 'both';

function weightsEffectivelyUniform(
  edgeWeights: Float32Array,
  edgeCount: number,
  eps = 1e-6,
): boolean {
  for (let e = 0; e < edgeCount; e++) {
    if (
      !Number.isFinite(edgeWeights[e]) ||
      Math.abs(edgeWeights[e] - 1) > eps
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Computes per-edge link strength and ideal length from base Barnes–Hut link coefficients.
 * When `influence === 'off'` or weights are missing/short, returns base strength copy and uniform distances.
 * When every weight ≈ 1, skips scaling (same as off, avoids noisy multiplies).
 */
export function buildPerEdgeLinkPhysics(
  edgeWeights: Float32Array | null,
  edgeCount: number,
  influence: EdgeWeightInfluenceArg,
  baseStrength: Float64Array,
  effectiveLinkDistance: number,
): { strength: Float64Array; linkDistancePerEdge: Float64Array } {
  const strength = new Float64Array(baseStrength);
  const linkDistancePerEdge = new Float64Array(edgeCount);
  linkDistancePerEdge.fill(effectiveLinkDistance);

  if (
    !edgeWeights ||
    edgeWeights.length < edgeCount ||
    influence === 'off' ||
    weightsEffectivelyUniform(edgeWeights, edgeCount)
  ) {
    return { strength, linkDistancePerEdge };
  }

  const useStrength = influence === 'linkStrength' || influence === 'both';
  const useDistance = influence === 'linkDistance' || influence === 'both';

  for (let e = 0; e < edgeCount; e++) {
    let w = edgeWeights[e];
    if (!Number.isFinite(w) || w <= 0) w = 1;
    const factor = Math.pow(w, EDGE_WEIGHT_EXPONENT);
    if (useStrength) strength[e] *= factor;
    if (useDistance) linkDistancePerEdge[e] = effectiveLinkDistance / factor;
  }

  return { strength, linkDistancePerEdge };
}
