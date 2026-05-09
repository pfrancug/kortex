import { describe, it, expect } from 'vitest';
import * as mat4 from './math/mat4';
import { FrustumCuller } from './FrustumCuller';

function makeVP(): Float32Array {
  const proj = mat4.create();
  const view = mat4.create();
  const vp = mat4.create();
  mat4.perspective(proj, Math.PI / 3, 1.0, 0.1, 100);
  mat4.lookAt(
    view,
    new Float32Array([0, 0, 5]),
    new Float32Array([0, 0, 0]),
    new Float32Array([0, 1, 0]),
  );
  mat4.multiply(vp, proj, view);
  return vp;
}

describe('FrustumCuller', () => {
  it('accepts AABB at origin (inside frustum)', () => {
    const culler = new FrustumCuller();
    culler.update(makeVP());
    expect(culler.testAABB(-1, -1, -1, 1, 1, 1)).toBe(true);
  });

  it('rejects AABB far behind the camera', () => {
    const culler = new FrustumCuller();
    culler.update(makeVP());
    expect(culler.testAABB(-1, -1, 200, 1, 1, 201)).toBe(false);
  });

  it('rejects AABB far to the left', () => {
    const culler = new FrustumCuller();
    culler.update(makeVP());
    expect(culler.testAABB(-500, -1, -1, -499, 1, 1)).toBe(false);
  });

  it('accepts AABB partially overlapping the frustum', () => {
    const culler = new FrustumCuller();
    culler.update(makeVP());
    expect(culler.testAABB(-100, -1, -1, 0.5, 1, 1)).toBe(true);
  });
});
