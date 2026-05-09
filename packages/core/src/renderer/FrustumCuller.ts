import type { Mat4 } from './math/mat4';

/**
 * Six frustum planes extracted from a view-projection matrix.
 * Each plane is [a, b, c, d] where ax + by + cz + d >= 0 is "inside".
 */
export type FrustumPlanes = Float32Array; // 6 * 4 = 24 floats

const NUM_PLANES = 6;
const FLOATS_PER_PLANE = 4;

export class FrustumCuller {
  readonly planes: FrustumPlanes = new Float32Array(
    NUM_PLANES * FLOATS_PER_PLANE,
  );

  /**
   * Extract frustum planes from a combined view-projection matrix.
   * Gribb/Hartmann method — normalises each plane for distance tests.
   */
  update(vp: Mat4): void {
    const p = this.planes;

    // Left:   row3 + row0
    setPlane(
      p,
      0,
      vp[3] + vp[0],
      vp[7] + vp[4],
      vp[11] + vp[8],
      vp[15] + vp[12],
    );
    // Right:  row3 - row0
    setPlane(
      p,
      1,
      vp[3] - vp[0],
      vp[7] - vp[4],
      vp[11] - vp[8],
      vp[15] - vp[12],
    );
    // Bottom: row3 + row1
    setPlane(
      p,
      2,
      vp[3] + vp[1],
      vp[7] + vp[5],
      vp[11] + vp[9],
      vp[15] + vp[13],
    );
    // Top:    row3 - row1
    setPlane(
      p,
      3,
      vp[3] - vp[1],
      vp[7] - vp[5],
      vp[11] - vp[9],
      vp[15] - vp[13],
    );
    // Near:   row3 + row2
    setPlane(
      p,
      4,
      vp[3] + vp[2],
      vp[7] + vp[6],
      vp[11] + vp[10],
      vp[15] + vp[14],
    );
    // Far:    row3 - row2
    setPlane(
      p,
      5,
      vp[3] - vp[2],
      vp[7] - vp[6],
      vp[11] - vp[10],
      vp[15] - vp[14],
    );
  }

  /**
   * Returns true if the AABB is at least partially inside the frustum.
   * Uses the "p-vertex" (most-positive-along-normal) test for each plane.
   */
  testAABB(
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number,
  ): boolean {
    const p = this.planes;
    for (let i = 0; i < NUM_PLANES; i++) {
      const o = i * FLOATS_PER_PLANE;
      const a = p[o],
        b = p[o + 1],
        c = p[o + 2],
        d = p[o + 3];

      // p-vertex: pick the AABB corner farthest along the plane normal
      const px = a >= 0 ? maxX : minX;
      const py = b >= 0 ? maxY : minY;
      const pz = c >= 0 ? maxZ : minZ;

      if (a * px + b * py + c * pz + d < 0) return false;
    }
    return true;
  }
}

function setPlane(
  planes: Float32Array,
  index: number,
  a: number,
  b: number,
  c: number,
  d: number,
): void {
  const len = Math.sqrt(a * a + b * b + c * c);
  if (len < 1e-10) return;
  const inv = 1 / len;
  const o = index * FLOATS_PER_PLANE;
  planes[o] = a * inv;
  planes[o + 1] = b * inv;
  planes[o + 2] = c * inv;
  planes[o + 3] = d * inv;
}
