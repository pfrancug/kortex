import type { Camera } from '@nexgraph/core';
import {
  createDynamicBuffer,
  getUniformLocations,
  linkProgram,
} from '@nexgraph/core';

const VERTEX_SOURCE = `#version 300 es
in vec3 a_position;
in vec3 a_color;
uniform mat4 u_viewProj;
uniform vec3 u_gridOrigin;
out vec3 v_color;
void main() {
  v_color = a_color;
  vec3 worldPos = a_position + u_gridOrigin;
  gl_Position = u_viewProj * vec4(worldPos, 1.0);
}`;

const FRAGMENT_SOURCE = `#version 300 es
precision highp float;
in vec3 v_color;
out vec4 fragColor;
void main() {
  fragColor = vec4(v_color, 1.0);
}`;

const FLOATS_PER_VERTEX = 6;
const STRIDE_BYTES = FLOATS_PER_VERTEX * 4;

const DEFAULT_MIN_HALF_EXTENT = 8;
/** Max grid lines per axis per side of center (`±step`, ±2step… along X and along Z). */
const DEFAULT_MAX_STRIPES_PER_SIDE = 48;

export interface AxesGridOptions {
  /** Floor for computed half-extent (world units). */
  minHalfExtent?: number;
  /**
   * Max grid offsets per half‑axis on ground (`x,z = ±n·step`), step coarse‑adjusted first.
   * Full grid draws both **X‑parallel** and **Z‑parallel** families.
   */
  maxStripesPerSide?: number;
}

export class AxesGrid {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly vertexBuffer: WebGLBuffer;
  private readonly uniforms: Record<
    'u_viewProj' | 'u_gridOrigin',
    WebGLUniformLocation | null
  >;
  private vertexCount = 0;

  private readonly minHalfExtent: number;
  private readonly maxStripesPerSide: number;

  private lastHalfExtent = -1;
  private lastStep = -1;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    options: AxesGridOptions = {},
  ) {
    this.minHalfExtent = options.minHalfExtent ?? DEFAULT_MIN_HALF_EXTENT;
    this.maxStripesPerSide =
      options.maxStripesPerSide ?? DEFAULT_MAX_STRIPES_PER_SIDE;

    this.program = linkProgram(gl, VERTEX_SOURCE, FRAGMENT_SOURCE);
    this.uniforms = getUniformLocations(gl, this.program, [
      'u_viewProj',
      'u_gridOrigin',
    ]);

    const vao = gl.createVertexArray();
    if (!vao) throw new Error('gl.createVertexArray returned null');
    this.vao = vao;

    gl.bindVertexArray(vao);
    this.vertexBuffer = createDynamicBuffer(
      gl,
      gl.ARRAY_BUFFER,
      STRIDE_BYTES * 8,
    );

    const aPos = gl.getAttribLocation(this.program, 'a_position');
    const aColor = gl.getAttribLocation(this.program, 'a_color');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, STRIDE_BYTES, 0);
    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, STRIDE_BYTES, 3 * 4);
    gl.bindVertexArray(null);

    // First draw uploads full buffer via bufferData.
    this.vertexCount = 0;
  }

  /**
   * Horizontal XZ grid and RGB axes through **`gridOrigin`** (world space).
   * Pass the graph centroid so the floor stays under the data while the orbit camera moves independently.
   */
  draw(
    camera: Camera,
    viewportAspect: number,
    gridOrigin: readonly [number, number, number],
  ): void {
    const halfExtent = computeHalfExtent(
      camera,
      viewportAspect,
      this.minHalfExtent,
    );

    let step = niceGridStep(halfExtent / 10);
    let stripesEachSide = Math.floor(halfExtent / step + 1e-9);
    if (stripesEachSide > this.maxStripesPerSide) {
      step = niceGridStep(halfExtent / this.maxStripesPerSide);
      stripesEachSide = Math.floor(halfExtent / step + 1e-9);
    }

    const extentChanged =
      this.vertexCount === 0 ||
      step !== this.lastStep ||
      this.lastHalfExtent < 0 ||
      Math.abs(halfExtent - this.lastHalfExtent) >
        Math.max(this.lastHalfExtent * 0.06, 1e-5);

    if (extentChanged) {
      this.lastHalfExtent = halfExtent;
      this.lastStep = step;
      const data = buildVertexData(halfExtent, step, stripesEachSide);
      this.vertexCount = data.length / FLOATS_PER_VERTEX;
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    }

    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.u_viewProj, false, camera.viewProjection);
    gl.uniform3f(
      this.uniforms.u_gridOrigin,
      gridOrigin[0],
      gridOrigin[1],
      gridOrigin[2],
    );
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.LINES, 0, this.vertexCount);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.vertexBuffer);
  }
}

function computeHalfExtent(
  camera: Camera,
  viewportAspect: number,
  minHalf: number,
): number {
  const s = camera.state;
  const tanHalf = Math.tan(s.fovy * 0.5);
  const aspect =
    Number.isFinite(viewportAspect) && viewportAspect > 0 ? viewportAspect : 1;
  /** Visible span at target depth (orbit radius ≈ distance). */
  const fromFov = s.distance * tanHalf * Math.max(aspect, 1 / aspect) * 3;
  const cap = Math.min(s.far * 0.35, 1e9);
  return Math.min(cap, Math.max(minHalf, fromFov));
}

/** “Nice” step size ~ approx for grid majors (1 / 2 / 5 × 10^n). */
function niceGridStep(approx: number): number {
  if (!Number.isFinite(approx) || approx <= 0) return 1;
  const exp10 = 10 ** Math.floor(Math.log10(approx));
  const m = approx / exp10;
  let nice = 10;
  if (m <= 1) nice = 1;
  else if (m <= 2) nice = 2;
  else if (m <= 5) nice = 5;
  return nice * exp10;
}

/**
 * Local geometry before `u_gridOrigin`: horizontal plane **local y = 0** (XZ), lifted by origin’s **world Y**.
 * Grey: **grid** — segments ∥ **X** at **`z = ±n·step`** and ∥ **Z** at **`x = ±n·step`** (axes use center lines).
 * RGB: world **X** / **Y** / **Z** through anchor.
 */
function buildVertexData(
  halfExtent: number,
  step: number,
  stripesEachSide: number,
): Float32Array {
  const verts: number[] = [];
  const grey: [number, number, number] = [0.22, 0.24, 0.28];

  const nMax = Math.max(0, stripesEachSide);
  for (let n = 1; n <= nMax; n++) {
    const off = n * step;
    if (off > halfExtent + step * 1e-6) break;
    pushSegment(verts, -halfExtent, 0, off, halfExtent, 0, off, grey);
    pushSegment(verts, -halfExtent, 0, -off, halfExtent, 0, -off, grey);
    pushSegment(verts, off, 0, -halfExtent, off, 0, halfExtent, grey);
    pushSegment(verts, -off, 0, -halfExtent, -off, 0, halfExtent, grey);
  }

  pushSegment(verts, -halfExtent, 0, 0, halfExtent, 0, 0, [1.0, 0.25, 0.25]);
  pushSegment(verts, 0, -halfExtent, 0, 0, halfExtent, 0, [0.25, 1.0, 0.4]);
  pushSegment(verts, 0, 0, -halfExtent, 0, 0, halfExtent, [0.35, 0.55, 1.0]);

  return new Float32Array(verts);
}

function pushSegment(
  out: number[],
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  color: readonly [number, number, number],
): void {
  out.push(x0, y0, z0, color[0], color[1], color[2]);
  out.push(x1, y1, z1, color[0], color[1], color[2]);
}
