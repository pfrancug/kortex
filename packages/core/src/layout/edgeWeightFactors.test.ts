import { describe, expect, it } from 'vitest';

import {
  buildPerEdgeLinkPhysics,
  EDGE_WEIGHT_EXPONENT,
} from './edgeWeightFactors';

describe('buildPerEdgeLinkPhysics', () => {
  const baseStrength = new Float64Array([1, 2]);
  const ld = 30;

  it('off ignores weights', () => {
    const w = new Float32Array([100, 100]);
    const r = buildPerEdgeLinkPhysics(w, 2, 'off', baseStrength, ld);
    expect(r.strength[0]).toBe(1);
    expect(r.strength[1]).toBe(2);
    expect(r.linkDistancePerEdge[0]).toBe(ld);
    expect(r.linkDistancePerEdge[1]).toBe(ld);
  });

  it('linkStrength scales by w^β', () => {
    const w = new Float32Array([4, 1]);
    const r = buildPerEdgeLinkPhysics(w, 2, 'linkStrength', baseStrength, ld);
    expect(r.strength[0]).toBeCloseTo(1 * Math.pow(4, EDGE_WEIGHT_EXPONENT));
    expect(r.strength[1]).toBe(2);
    expect(r.linkDistancePerEdge[0]).toBe(ld);
    expect(r.linkDistancePerEdge[1]).toBe(ld);
  });

  it('linkDistance scales ideal length by w^{-β}', () => {
    const w = new Float32Array([4, 1]);
    const r = buildPerEdgeLinkPhysics(w, 2, 'linkDistance', baseStrength, ld);
    expect(r.linkDistancePerEdge[0]).toBeCloseTo(
      ld / Math.pow(4, EDGE_WEIGHT_EXPONENT),
    );
    expect(r.strength[0]).toBe(1);
    expect(r.strength[1]).toBe(2);
  });

  it('both applies strength and distance', () => {
    const w = new Float32Array([4, 1]);
    const r = buildPerEdgeLinkPhysics(w, 2, 'both', baseStrength, ld);
    expect(r.strength[0]).toBeCloseTo(Math.pow(4, EDGE_WEIGHT_EXPONENT));
    expect(r.linkDistancePerEdge[0]).toBeCloseTo(
      ld / Math.pow(4, EDGE_WEIGHT_EXPONENT),
    );
  });

  it('treats uniform weights equal to 1 as off', () => {
    const w = new Float32Array([1, 1]);
    const r = buildPerEdgeLinkPhysics(w, 2, 'linkStrength', baseStrength, ld);
    expect(r.strength[0]).toBe(1);
    expect(r.strength[1]).toBe(2);
  });

  it('non-finite or non-positive weights fall back to 1', () => {
    const w = new Float32Array([-1, NaN]);
    const r = buildPerEdgeLinkPhysics(w, 2, 'linkStrength', baseStrength, ld);
    expect(r.strength[0]).toBe(1);
    expect(r.strength[1]).toBe(2);
  });

  it('null weights behaves like off', () => {
    const r = buildPerEdgeLinkPhysics(
      null,
      2,
      'linkStrength',
      baseStrength,
      ld,
    );
    expect(r.strength[0]).toBe(1);
    expect(r.linkDistancePerEdge[0]).toBe(ld);
  });
});
