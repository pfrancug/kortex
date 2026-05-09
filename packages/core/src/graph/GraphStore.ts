import { createDynamicBuffer, updateBufferRange } from '../renderer/gl/buffer';

/** GPU buffer handles for graph data. @internal */
export interface GraphBuffers {
  position: WebGLBuffer;
  color: WebGLBuffer;
  size: WebGLBuffer;
  edgeIndex: WebGLBuffer;
  edgeIndexAttrib: WebGLBuffer;
  edgeColor: WebGLBuffer;
  nodeVisibility: WebGLBuffer;
  edgeVisibility: WebGLBuffer;
}

/** World-space radius when callers omit `sizes` — matches demo/generated graphs (~0.4–1 ×10); avoids imports dwarfing normalized layouts (~±10). */
const DEFAULT_NODE_SIZE = 1;
const DEFAULT_NODE_COLOR = new Uint8Array([120, 160, 255, 255]);
const DEFAULT_EDGE_COLOR = new Uint8Array([130, 150, 190, 200]);

/**
 * Owns all graph data as flat TypedArrays and manages GPU buffer uploads.
 *
 * Zero per-entity JS objects. Mutations avoid reallocation when capacity
 * is sufficient; the renderer never owns layout — it only consumes positions.
 */
export class GraphStore {
  /** Current number of active nodes. */
  nodeCount = 0;
  /** Current number of active edges. */
  edgeCount = 0;

  /** Monotonically increasing counter; bumped on every position mutation. */
  positionVersion = 0;
  /** Bumped when {@link sizes} change without necessarily touching positions (labels use radii). */
  sizeVersion = 0;

  positions: Float32Array = new Float32Array(0);
  colors: Uint8Array = new Uint8Array(0);
  sizes: Float32Array = new Float32Array(0);
  /** Optional per-node label strings. */
  labels: string[] = [];
  edgeIndices: Uint32Array = new Uint32Array(0);
  edgeColors: Uint8Array = new Uint8Array(0);
  nodeVisibility: Uint8Array = new Uint8Array(0);
  edgeVisibility: Uint8Array = new Uint8Array(0);

  private gl: WebGL2RenderingContext | null = null;
  private gpuBuffers: GraphBuffers | null = null;
  private nodeCapacity = 0;
  private edgeCapacity = 0;
  private gpuNodeCapacity = 0;
  private gpuEdgeCapacity = 0;

  /**
   * Binds this store to a GL context and allocates GPU buffers.
   * Must be called before any draw.
   */
  attach(gl: WebGL2RenderingContext): void {
    this.gl = gl;
    this.gpuBuffers = {
      position: createDynamicBuffer(gl, gl.ARRAY_BUFFER, 0),
      color: createDynamicBuffer(gl, gl.ARRAY_BUFFER, 0),
      size: createDynamicBuffer(gl, gl.ARRAY_BUFFER, 0),
      edgeIndex: createDynamicBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, 0),
      edgeIndexAttrib: createDynamicBuffer(gl, gl.ARRAY_BUFFER, 0),
      edgeColor: createDynamicBuffer(gl, gl.ARRAY_BUFFER, 0),
      nodeVisibility: createDynamicBuffer(gl, gl.ARRAY_BUFFER, 0),
      edgeVisibility: createDynamicBuffer(gl, gl.ARRAY_BUFFER, 0),
    };
    this.gpuNodeCapacity = 0;
    this.gpuEdgeCapacity = 0;
  }

  getBuffers(): GraphBuffers | null {
    return this.gpuBuffers;
  }

  /**
   * Estimate total GPU buffer memory in bytes.
   */
  estimateGpuMemory(): number {
    const nc = this.gpuNodeCapacity;
    const ec = this.gpuEdgeCapacity;
    return (
      nc * 3 * 4 + // position (float32 x3)
      nc * 4 + // color (uint8 x4)
      nc * 4 + // size (float32)
      nc + // nodeVisibility (uint8)
      ec * 2 * 4 + // edgeIndex (uint32 x2)
      ec * 2 * 4 + // edgeIndexAttrib (uint32 x2)
      ec * 4 + // edgeColor (uint8 x4)
      ec // edgeVisibility (uint8)
    );
  }

  /**
   * Replace node data wholesale.
   * Accepts raw TypedArrays — no adapter objects.
   */
  setNodes(
    positions: Float32Array,
    colors?: Uint8Array,
    sizes?: Float32Array,
    labels?: string[],
  ): void {
    const count = (positions.length / 3) | 0;
    this.ensureNodeCapacity(count);
    this.nodeCount = count;

    this.positions.set(positions, 0);

    if (colors && colors.length >= count * 4) {
      this.colors.set(colors, 0);
    } else {
      fillDefaultColors(this.colors, count, DEFAULT_NODE_COLOR);
    }

    if (sizes && sizes.length >= count) {
      this.sizes.set(sizes, 0);
    } else {
      this.sizes.fill(DEFAULT_NODE_SIZE, 0, count);
    }

    this.labels = labels ?? [];

    this.nodeVisibility.fill(1, 0, count);
    this.positionVersion++;

    this.uploadNodes();
  }

  /**
   * Replace edge data wholesale.
   * `indices` is a flat Uint32Array of [src0, dst0, src1, dst1, ...].
   */
  setEdges(indices: Uint32Array, colors?: Uint8Array): void {
    const count = (indices.length / 2) | 0;
    this.ensureEdgeCapacity(count);
    this.edgeCount = count;

    this.edgeIndices.set(indices, 0);

    if (colors && colors.length >= count * 4) {
      this.edgeColors.set(colors, 0);
    } else {
      fillDefaultColors(this.edgeColors, count, DEFAULT_EDGE_COLOR);
    }

    this.edgeVisibility.fill(1, 0, count);

    this.uploadEdges();
  }

  /**
   * Partial position update via bufferSubData.
   * When `range` is provided, only that slice is uploaded to the GPU.
   */
  updatePositions(
    positions: Float32Array,
    range?: { start: number; count: number },
  ): void {
    if (range) {
      const byteOffset = range.start * 3;
      const length = range.count * 3;
      this.positions.set(positions.subarray(0, length), byteOffset);
      this.uploadPositionRange(range.start, range.count);
    } else {
      const count = Math.min((positions.length / 3) | 0, this.nodeCount);
      this.positions.set(positions.subarray(0, count * 3), 0);
      this.uploadPositionRange(0, count);
    }
    this.positionVersion++;
  }

  /**
   * Update node colors for a subset of nodes.
   */
  updateColors(
    colors: Uint8Array,
    range?: { start: number; count: number },
  ): void {
    if (range) {
      const byteOffset = range.start * 4;
      const length = range.count * 4;
      this.colors.set(colors.subarray(0, length), byteOffset);
      this.uploadColorRange(range.start, range.count);
    } else {
      const count = Math.min((colors.length / 4) | 0, this.nodeCount);
      this.colors.set(colors.subarray(0, count * 4), 0);
      this.uploadColorRange(0, count);
    }
  }

  /**
   * Update per-node billboard radii (length ≥ active node count unless `range` is set).
   */
  updateSizes(
    sizes: Float32Array,
    range?: { start: number; count: number },
  ): void {
    if (range) {
      const start = range.start;
      const count = range.count;
      this.sizes.set(sizes.subarray(0, count), start);
      this.uploadSizeRange(start, count);
    } else {
      const count = Math.min(sizes.length, this.nodeCount);
      this.sizes.set(sizes.subarray(0, count), 0);
      this.uploadSizeRange(0, count);
    }
    this.sizeVersion++;
  }

  /**
   * Update node visibility mask (1 = visible, 0 = hidden).
   */
  setNodeVisibility(mask: Uint8Array): void {
    const count = Math.min(mask.length, this.nodeCount);
    this.nodeVisibility.set(mask.subarray(0, count), 0);
    this.uploadNodeVisibility();
  }

  /**
   * Update edge visibility mask (1 = visible, 0 = hidden).
   */
  setEdgeVisibility(mask: Uint8Array): void {
    const count = Math.min(mask.length, this.edgeCount);
    this.edgeVisibility.set(mask.subarray(0, count), 0);
    this.uploadEdgeVisibility();
  }

  /**
   * Delete GL buffers, release references.
   */
  dispose(): void {
    if (this.gl && this.gpuBuffers) {
      const gl = this.gl;
      gl.deleteBuffer(this.gpuBuffers.position);
      gl.deleteBuffer(this.gpuBuffers.color);
      gl.deleteBuffer(this.gpuBuffers.size);
      gl.deleteBuffer(this.gpuBuffers.edgeIndex);
      gl.deleteBuffer(this.gpuBuffers.edgeIndexAttrib);
      gl.deleteBuffer(this.gpuBuffers.edgeColor);
      gl.deleteBuffer(this.gpuBuffers.nodeVisibility);
      gl.deleteBuffer(this.gpuBuffers.edgeVisibility);
    }
    this.gpuBuffers = null;
    this.gl = null;
    this.nodeCount = 0;
    this.edgeCount = 0;
    this.nodeCapacity = 0;
    this.edgeCapacity = 0;
    this.gpuNodeCapacity = 0;
    this.gpuEdgeCapacity = 0;
  }

  // ── CPU capacity management ──────────────────────────────────────

  private ensureNodeCapacity(count: number): void {
    if (count <= this.nodeCapacity) return;
    const cap = growCapacity(this.nodeCapacity, count);
    this.nodeCapacity = cap;
    this.positions = growTypedArray(Float32Array, this.positions, cap * 3);
    this.colors = growTypedArray(Uint8Array, this.colors, cap * 4);
    this.sizes = growTypedArray(Float32Array, this.sizes, cap);
    this.nodeVisibility = growTypedArray(Uint8Array, this.nodeVisibility, cap);
  }

  private ensureEdgeCapacity(count: number): void {
    if (count <= this.edgeCapacity) return;
    const cap = growCapacity(this.edgeCapacity, count);
    this.edgeCapacity = cap;
    this.edgeIndices = growTypedArray(Uint32Array, this.edgeIndices, cap * 2);
    this.edgeColors = growTypedArray(Uint8Array, this.edgeColors, cap * 4);
    this.edgeVisibility = growTypedArray(Uint8Array, this.edgeVisibility, cap);
  }

  // ── GPU uploads ──────────────────────────────────────────────────

  private uploadNodes(): void {
    const gl = this.gl;
    const buf = this.gpuBuffers;
    if (!gl || !buf) return;

    if (this.nodeCount > this.gpuNodeCapacity) {
      this.gpuNodeCapacity = this.nodeCapacity;
      orphanBuffer(
        gl,
        gl.ARRAY_BUFFER,
        buf.position,
        this.gpuNodeCapacity * 3 * 4,
      );
      orphanBuffer(gl, gl.ARRAY_BUFFER, buf.color, this.gpuNodeCapacity * 4);
      orphanBuffer(gl, gl.ARRAY_BUFFER, buf.size, this.gpuNodeCapacity * 4);
      orphanBuffer(
        gl,
        gl.ARRAY_BUFFER,
        buf.nodeVisibility,
        this.gpuNodeCapacity,
      );
    }

    const n = this.nodeCount;
    updateBufferRange(
      gl,
      gl.ARRAY_BUFFER,
      buf.position,
      0,
      this.positions.subarray(0, n * 3),
    );
    updateBufferRange(
      gl,
      gl.ARRAY_BUFFER,
      buf.color,
      0,
      this.colors.subarray(0, n * 4),
    );
    updateBufferRange(
      gl,
      gl.ARRAY_BUFFER,
      buf.size,
      0,
      this.sizes.subarray(0, n),
    );
    updateBufferRange(
      gl,
      gl.ARRAY_BUFFER,
      buf.nodeVisibility,
      0,
      this.nodeVisibility.subarray(0, n),
    );
  }

  private uploadEdges(): void {
    const gl = this.gl;
    const buf = this.gpuBuffers;
    if (!gl || !buf) return;

    if (this.edgeCount > this.gpuEdgeCapacity) {
      this.gpuEdgeCapacity = this.edgeCapacity;
      const newBytes = this.gpuEdgeCapacity * 2 * 4;
      orphanBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, buf.edgeIndex, newBytes);
      orphanBuffer(gl, gl.ARRAY_BUFFER, buf.edgeIndexAttrib, newBytes);
      orphanBuffer(
        gl,
        gl.ARRAY_BUFFER,
        buf.edgeColor,
        this.gpuEdgeCapacity * 4,
      );
      orphanBuffer(
        gl,
        gl.ARRAY_BUFFER,
        buf.edgeVisibility,
        this.gpuEdgeCapacity,
      );
    }

    const e = this.edgeCount;
    const edgeSub = this.edgeIndices.subarray(0, e * 2);
    updateBufferRange(gl, gl.ELEMENT_ARRAY_BUFFER, buf.edgeIndex, 0, edgeSub);
    updateBufferRange(gl, gl.ARRAY_BUFFER, buf.edgeIndexAttrib, 0, edgeSub);
    updateBufferRange(
      gl,
      gl.ARRAY_BUFFER,
      buf.edgeColor,
      0,
      this.edgeColors.subarray(0, e * 4),
    );
    updateBufferRange(
      gl,
      gl.ARRAY_BUFFER,
      buf.edgeVisibility,
      0,
      this.edgeVisibility.subarray(0, e),
    );
  }

  private uploadPositionRange(startNode: number, count: number): void {
    const gl = this.gl;
    const buf = this.gpuBuffers;
    if (!gl || !buf) return;
    const floatOffset = startNode * 3;
    updateBufferRange(
      gl,
      gl.ARRAY_BUFFER,
      buf.position,
      floatOffset * 4,
      this.positions.subarray(floatOffset, floatOffset + count * 3),
    );
  }

  private uploadColorRange(startNode: number, count: number): void {
    const gl = this.gl;
    const buf = this.gpuBuffers;
    if (!gl || !buf) return;
    const byteOffset = startNode * 4;
    updateBufferRange(
      gl,
      gl.ARRAY_BUFFER,
      buf.color,
      byteOffset,
      this.colors.subarray(byteOffset, byteOffset + count * 4),
    );
  }

  private uploadSizeRange(startNode: number, count: number): void {
    const gl = this.gl;
    const buf = this.gpuBuffers;
    if (!gl || !buf) return;
    const byteOffset = startNode * 4;
    updateBufferRange(
      gl,
      gl.ARRAY_BUFFER,
      buf.size,
      byteOffset,
      this.sizes.subarray(startNode, startNode + count),
    );
  }

  private uploadNodeVisibility(): void {
    const gl = this.gl;
    const buf = this.gpuBuffers;
    if (!gl || !buf) return;
    updateBufferRange(
      gl,
      gl.ARRAY_BUFFER,
      buf.nodeVisibility,
      0,
      this.nodeVisibility.subarray(0, this.nodeCount),
    );
  }

  private uploadEdgeVisibility(): void {
    const gl = this.gl;
    const buf = this.gpuBuffers;
    if (!gl || !buf) return;
    updateBufferRange(
      gl,
      gl.ARRAY_BUFFER,
      buf.edgeVisibility,
      0,
      this.edgeVisibility.subarray(0, this.edgeCount),
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function growCapacity(current: number, needed: number): number {
  let cap = Math.max(current, 1024);
  while (cap < needed) cap *= 2;
  return cap;
}

type TypedArrayCtor<T> = { new (len: number): T };

function growTypedArray<
  T extends ArrayBufferView & {
    set(a: ArrayLike<number>, offset: number): void;
    length: number;
  },
>(Ctor: TypedArrayCtor<T>, old: T, newLength: number): T {
  if (old.length >= newLength) return old;
  const next = new Ctor(newLength);
  next.set(old as unknown as ArrayLike<number>, 0);
  return next;
}

function fillDefaultColors(
  buf: Uint8Array,
  count: number,
  rgba: Uint8Array,
): void {
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    buf[o] = rgba[0];
    buf[o + 1] = rgba[1];
    buf[o + 2] = rgba[2];
    buf[o + 3] = rgba[3];
  }
}

/**
 * Orphan-and-reallocate: tells the driver the old contents are
 * discardable, which avoids pipeline stalls on resize.
 */
function orphanBuffer(
  gl: WebGL2RenderingContext,
  target: GLenum,
  buffer: WebGLBuffer,
  byteLength: number,
): void {
  gl.bindBuffer(target, buffer);
  gl.bufferData(target, byteLength, gl.DYNAMIC_DRAW);
}
