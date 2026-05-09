import { describe, it, expect } from 'vitest';
import * as mat4 from '../renderer/math/mat4';
import { FrustumCuller } from '../renderer/FrustumCuller';
import { ChunkIndex, type ChunkRange } from './ChunkIndex';

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

describe('ChunkIndex', () => {
  it('builds node chunks and returns visible ones', () => {
    const idx = new ChunkIndex();
    const positions = new Float32Array([0, 0, 0, 1, 1, 1, -1, -1, -1]);
    idx.buildNodeChunks(positions, 3);

    const culler = new FrustumCuller();
    culler.update(makeVP());

    const out: ChunkRange[] = [];
    const count = idx.getVisibleNodeChunks(culler, 3, out);

    expect(count).toBe(1);
    expect(out[0].offset).toBe(0);
    expect(out[0].count).toBe(3);
  });

  it('builds edge chunks from indices and positions', () => {
    const idx = new ChunkIndex();
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const edgeIndices = new Uint32Array([0, 1, 1, 2]);
    idx.buildEdgeChunks(edgeIndices, 2, positions);

    const culler = new FrustumCuller();
    culler.update(makeVP());

    const out: ChunkRange[] = [];
    const count = idx.getVisibleEdgeChunks(culler, 2, out);

    expect(count).toBe(1);
    expect(out[0].count).toBe(2);
  });
});
