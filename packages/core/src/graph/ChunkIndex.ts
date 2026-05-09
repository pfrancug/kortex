import { FrustumCuller } from '../renderer/FrustumCuller';

export interface ChunkRange {
  offset: number;
  count: number;
}

const NODE_CHUNK_SIZE = 65_536;
const EDGE_CHUNK_SIZE = 100_000;

/**
 * Divides graph data into fixed-size index-range chunks and
 * computes an AABB per chunk for frustum culling.
 *
 * Chunks are index-sequential (not spatially sorted).
 * Spatial coherence relies on the data source or a future
 * Morton-order sort pass.
 */
export class ChunkIndex {
  private nodeChunkCount = 0;
  private edgeChunkCount = 0;

  // 6 floats per chunk: [minX, minY, minZ, maxX, maxY, maxZ]
  private nodeAABBs = new Float32Array(0);
  private edgeAABBs = new Float32Array(0);

  private nodeChunkSize = NODE_CHUNK_SIZE;
  private edgeChunkSize = EDGE_CHUNK_SIZE;

  getNodeChunkSize(): number {
    return this.nodeChunkSize;
  }
  getEdgeChunkSize(): number {
    return this.edgeChunkSize;
  }

  /**
   * Rebuild node chunk AABBs from positions.
   */
  buildNodeChunks(positions: Float32Array, nodeCount: number): void {
    const cs = this.nodeChunkSize;
    this.nodeChunkCount = Math.ceil(nodeCount / cs);
    const floats = this.nodeChunkCount * 6;
    if (this.nodeAABBs.length < floats) {
      this.nodeAABBs = new Float32Array(floats);
    }

    for (let c = 0; c < this.nodeChunkCount; c++) {
      const start = c * cs;
      const end = Math.min(start + cs, nodeCount);
      const o = c * 6;

      let minX = Infinity,
        minY = Infinity,
        minZ = Infinity;
      let maxX = -Infinity,
        maxY = -Infinity,
        maxZ = -Infinity;

      for (let i = start; i < end; i++) {
        const p = i * 3;
        const x = positions[p],
          y = positions[p + 1],
          z = positions[p + 2];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
      }

      this.nodeAABBs[o] = minX;
      this.nodeAABBs[o + 1] = minY;
      this.nodeAABBs[o + 2] = minZ;
      this.nodeAABBs[o + 3] = maxX;
      this.nodeAABBs[o + 4] = maxY;
      this.nodeAABBs[o + 5] = maxZ;
    }
  }

  /**
   * Rebuild edge chunk AABBs from edge indices and node positions.
   */
  buildEdgeChunks(
    edgeIndices: Uint32Array,
    edgeCount: number,
    positions: Float32Array,
  ): void {
    const cs = this.edgeChunkSize;
    this.edgeChunkCount = Math.ceil(edgeCount / cs);
    const floats = this.edgeChunkCount * 6;
    if (this.edgeAABBs.length < floats) {
      this.edgeAABBs = new Float32Array(floats);
    }

    for (let c = 0; c < this.edgeChunkCount; c++) {
      const start = c * cs;
      const end = Math.min(start + cs, edgeCount);
      const o = c * 6;

      let minX = Infinity,
        minY = Infinity,
        minZ = Infinity;
      let maxX = -Infinity,
        maxY = -Infinity,
        maxZ = -Infinity;

      for (let e = start; e < end; e++) {
        const src = edgeIndices[e * 2];
        const dst = edgeIndices[e * 2 + 1];

        for (const idx of [src, dst]) {
          const p = idx * 3;
          const x = positions[p],
            y = positions[p + 1],
            z = positions[p + 2];
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (z < minZ) minZ = z;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
          if (z > maxZ) maxZ = z;
        }
      }

      this.edgeAABBs[o] = minX;
      this.edgeAABBs[o + 1] = minY;
      this.edgeAABBs[o + 2] = minZ;
      this.edgeAABBs[o + 3] = maxX;
      this.edgeAABBs[o + 4] = maxY;
      this.edgeAABBs[o + 5] = maxZ;
    }
  }

  /**
   * Returns visible node chunk ranges after frustum culling.
   */
  getVisibleNodeChunks(
    culler: FrustumCuller,
    nodeCount: number,
    out: ChunkRange[],
  ): number {
    let count = 0;
    const cs = this.nodeChunkSize;

    for (let c = 0; c < this.nodeChunkCount; c++) {
      const o = c * 6;
      if (
        !culler.testAABB(
          this.nodeAABBs[o],
          this.nodeAABBs[o + 1],
          this.nodeAABBs[o + 2],
          this.nodeAABBs[o + 3],
          this.nodeAABBs[o + 4],
          this.nodeAABBs[o + 5],
        )
      )
        continue;

      const offset = c * cs;
      const chunkCount = Math.min(cs, nodeCount - offset);
      if (count >= out.length) out.push({ offset: 0, count: 0 });
      out[count].offset = offset;
      out[count].count = chunkCount;
      count++;
    }

    return count;
  }

  /**
   * Returns visible edge chunk ranges after frustum culling.
   */
  getVisibleEdgeChunks(
    culler: FrustumCuller,
    edgeCount: number,
    out: ChunkRange[],
  ): number {
    let count = 0;
    const cs = this.edgeChunkSize;

    for (let c = 0; c < this.edgeChunkCount; c++) {
      const o = c * 6;
      if (
        !culler.testAABB(
          this.edgeAABBs[o],
          this.edgeAABBs[o + 1],
          this.edgeAABBs[o + 2],
          this.edgeAABBs[o + 3],
          this.edgeAABBs[o + 4],
          this.edgeAABBs[o + 5],
        )
      )
        continue;

      const offset = c * cs;
      const chunkCount = Math.min(cs, edgeCount - offset);
      if (count >= out.length) out.push({ offset: 0, count: 0 });
      out[count].offset = offset;
      out[count].count = chunkCount;
      count++;
    }

    return count;
  }
}
