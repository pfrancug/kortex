import type { Camera } from './Camera';
import type { GraphBuffers } from '../graph/GraphStore';
import { linkProgram, getUniformLocations } from './gl/shader';
import { createStaticBuffer } from './gl/buffer';

// ── Shaders ────────────────────────────────────────────────────────

const VERT = `#version 300 es
layout(location = 0) in vec2  a_quad;
layout(location = 1) in uint  a_source;
layout(location = 2) in uint  a_target;
layout(location = 3) in vec4  a_color;
layout(location = 4) in float a_visible;

uniform mat4      u_viewProj;
uniform sampler2D u_posTex;
uniform int       u_posTexWidth;
uniform vec2      u_resolution;
uniform float     u_lineWidth;
uniform float     u_edgeAlpha;
uniform vec3      u_cameraPos;
uniform float     u_maxDist;

out vec4  v_color;
out float v_side;

vec3 fetchPos(uint idx) {
  int i = int(idx);
  return texelFetch(u_posTex, ivec2(i % u_posTexWidth, i / u_posTexWidth), 0).xyz;
}

void main() {
  if (a_visible < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  vec3 posA = fetchPos(a_source);
  vec3 posB = fetchPos(a_target);

  vec4 clipA = u_viewProj * vec4(posA, 1.0);
  vec4 clipB = u_viewProj * vec4(posB, 1.0);

  // Homogeneous perpendicular (reduces perspective “bowing” vs differencing divided NDC).
  vec2 h = vec2(
    clipB.x * clipA.w - clipA.x * clipB.w,
    clipB.y * clipA.w - clipA.y * clipB.w
  );
  float hLen = length(h);
  if (hLen < 1e-7) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec2 nClip = vec2(-h.y, h.x) / hLen;

  vec4 clip = a_quad.x < 0.5 ? clipA : clipB;

  vec2 ndcOffset = nClip * (a_quad.y * u_lineWidth);
  ndcOffset *= vec2(2.0 / u_resolution.x, 2.0 / u_resolution.y);
  clip.xy += ndcOffset * clip.w;

  gl_Position = clip;

  // Distance-based edge fading: edges beyond u_maxDist are hidden,
  // with a smooth fade over the last 20% of the range.
  float fadeFactor = 1.0;
  if (u_maxDist > 0.0) {
    vec3 midpoint = (posA + posB) * 0.5;
    float dist = length(midpoint - u_cameraPos);
    float fadeStart = u_maxDist * 0.8;
    fadeFactor = 1.0 - clamp((dist - fadeStart) / (u_maxDist - fadeStart), 0.0, 1.0);
  }

  v_color = vec4(a_color.rgb, a_color.a * u_edgeAlpha * fadeFactor);
  v_side = a_quad.y;
}`;

const FRAG = `#version 300 es
precision highp float;

in vec4  v_color;
in float v_side;
out vec4 fragColor;

void main() {
  float aa = 1.0 - smoothstep(0.35, 0.5, abs(v_side));
  fragColor = vec4(v_color.rgb, v_color.a * aa);
}`;

// ── Quad geometry (triangle strip) ─────────────────────────────────
//   (endpoint, side)

const QUAD_VERTS = new Float32Array([0.0, -0.5, 0.0, 0.5, 1.0, -0.5, 1.0, 0.5]);

// ── Constants ──────────────────────────────────────────────────────

const UNIFORM_NAMES = [
  'u_viewProj',
  'u_posTex',
  'u_posTexWidth',
  'u_resolution',
  'u_lineWidth',
  'u_edgeAlpha',
  'u_cameraPos',
  'u_maxDist',
] as const;

const POS_TEX_WIDTH = 2048;
const CHUNK_SIZE = 100_000;

// ── Renderer ───────────────────────────────────────────────────────

export class EdgeRenderer {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly quadBuffer: WebGLBuffer;
  private readonly uniforms: Record<
    (typeof UNIFORM_NAMES)[number],
    WebGLUniformLocation | null
  >;

  private posTex: WebGLTexture;
  private posTexWidth = POS_TEX_WIDTH;
  private posTexHeight = 0;
  private lastPosVersion = -1;
  private posTexData: Float32Array = new Float32Array(0);

  lineWidth = 2.0;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly graphBuffers: GraphBuffers,
  ) {
    this.program = linkProgram(gl, VERT, FRAG);
    this.uniforms = getUniformLocations(gl, this.program, UNIFORM_NAMES);

    const tex = gl.createTexture();
    if (!tex) throw new Error('gl.createTexture returned null');
    this.posTex = tex;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const vao = gl.createVertexArray();
    if (!vao) throw new Error('gl.createVertexArray returned null');
    this.vao = vao;
    gl.bindVertexArray(vao);

    // loc 0 — quad corner (per-vertex)
    this.quadBuffer = createStaticBuffer(gl, gl.ARRAY_BUFFER, QUAD_VERTS);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // loc 1 — source node index (per-instance, uint)
    // Must use edgeIndexAttrib (ARRAY_BUFFER) — WebGL forbids using
    // an ELEMENT_ARRAY_BUFFER as a vertex attribute source.
    gl.bindBuffer(gl.ARRAY_BUFFER, graphBuffers.edgeIndexAttrib);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribIPointer(1, 1, gl.UNSIGNED_INT, 8, 0);
    gl.vertexAttribDivisor(1, 1);

    // loc 2 — target node index (per-instance, uint)
    gl.enableVertexAttribArray(2);
    gl.vertexAttribIPointer(2, 1, gl.UNSIGNED_INT, 8, 4);
    gl.vertexAttribDivisor(2, 1);

    // loc 3 — edge color (per-instance, ubyte normalized)
    gl.bindBuffer(gl.ARRAY_BUFFER, graphBuffers.edgeColor);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.vertexAttribDivisor(3, 1);

    // loc 4 — edge visibility (per-instance, ubyte NOT normalized)
    gl.bindBuffer(gl.ARRAY_BUFFER, graphBuffers.edgeVisibility);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.UNSIGNED_BYTE, false, 0, 0);
    gl.vertexAttribDivisor(4, 1);

    gl.bindVertexArray(null);
  }

  /**
   * Upload node positions into the lookup texture when the version changes.
   */
  updatePositionTexture(
    positions: Float32Array,
    nodeCount: number,
    version: number,
  ): void {
    if (version === this.lastPosVersion) return;
    this.lastPosVersion = version;

    const w = this.posTexWidth;
    const h = Math.max(1, Math.ceil(nodeCount / w));

    const texelCount = w * h;
    if (this.posTexData.length < texelCount * 4) {
      this.posTexData = new Float32Array(texelCount * 4);
    }

    const data = this.posTexData;
    for (let i = 0; i < nodeCount; i++) {
      const s = i * 3;
      const d = i * 4;
      data[d] = positions[s];
      data[d + 1] = positions[s + 1];
      data[d + 2] = positions[s + 2];
      // data[d + 3] stays 0 (alpha / padding)
    }

    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.posTex);

    if (h !== this.posTexHeight) {
      this.posTexHeight = h;
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA32F,
        w,
        h,
        0,
        gl.RGBA,
        gl.FLOAT,
        data.subarray(0, w * h * 4),
      );
    } else {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        w,
        h,
        gl.RGBA,
        gl.FLOAT,
        data.subarray(0, w * h * 4),
      );
    }
  }

  edgeAlpha = 1.0;
  /** Max distance from camera at which edges are visible. 0 = unlimited. */
  maxDist = 0;

  draw(
    camera: Camera,
    edgeCount: number,
    viewportWidth: number,
    viewportHeight: number,
  ): number {
    if (edgeCount === 0) return 0;
    this.setUniforms(camera, viewportWidth, viewportHeight);
    const gl = this.gl;
    gl.bindVertexArray(this.vao);

    const numChunks = Math.ceil(edgeCount / CHUNK_SIZE);
    for (let c = 0; c < numChunks; c++) {
      const offset = c * CHUNK_SIZE;
      const count = Math.min(CHUNK_SIZE, edgeCount - offset);
      this.bindAndDrawEdgeChunk(offset, count);
    }

    gl.bindVertexArray(null);
    return numChunks;
  }

  beginDraw(
    camera: Camera,
    viewportWidth: number,
    viewportHeight: number,
  ): void {
    this.setUniforms(camera, viewportWidth, viewportHeight);
    this.gl.bindVertexArray(this.vao);
  }

  private setUniforms(camera: Camera, w: number, h: number): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.u_viewProj, false, camera.viewProjection);
    gl.uniform1i(this.uniforms.u_posTexWidth, this.posTexWidth);
    gl.uniform2f(this.uniforms.u_resolution, w, h);
    gl.uniform1f(this.uniforms.u_lineWidth, this.lineWidth);
    gl.uniform1f(this.uniforms.u_edgeAlpha, this.edgeAlpha);
    gl.uniform3f(
      this.uniforms.u_cameraPos,
      camera.position[0],
      camera.position[1],
      camera.position[2],
    );
    gl.uniform1f(this.uniforms.u_maxDist, this.maxDist);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.posTex);
    gl.uniform1i(this.uniforms.u_posTex, 0);
  }

  drawEdgeChunk(offset: number, count: number): void {
    if (count === 0) return;
    this.bindAndDrawEdgeChunk(offset, count);
  }

  endDraw(): void {
    this.gl.bindVertexArray(null);
  }

  private bindAndDrawEdgeChunk(offset: number, count: number): void {
    const gl = this.gl;
    const edgeByteOff = offset * 8;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.graphBuffers.edgeIndexAttrib);
    gl.vertexAttribIPointer(1, 1, gl.UNSIGNED_INT, 8, edgeByteOff);
    gl.vertexAttribIPointer(2, 1, gl.UNSIGNED_INT, 8, edgeByteOff + 4);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.graphBuffers.edgeColor);
    gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, 0, offset * 4);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.graphBuffers.edgeVisibility);
    gl.vertexAttribPointer(4, 1, gl.UNSIGNED_BYTE, false, 0, offset);

    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.quadBuffer);
    gl.deleteTexture(this.posTex);
  }
}
