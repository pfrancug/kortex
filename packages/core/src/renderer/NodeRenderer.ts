import type { Camera } from './Camera';
import type { GraphBuffers } from '../graph/GraphStore';
import { linkProgram, getUniformLocations } from './gl/shader';
import { createStaticBuffer } from './gl/buffer';

// ── Shaders ────────────────────────────────────────────────────────

const VERT = `#version 300 es
layout(location = 0) in vec2 a_quad;
layout(location = 1) in vec3 a_center;
layout(location = 2) in vec4 a_color;
layout(location = 3) in float a_size;
layout(location = 4) in float a_visible;

uniform mat4 u_view;
uniform mat4 u_proj;
uniform int u_hoveredId;
uniform int u_selectedId;
uniform int u_instanceOffset;
uniform float u_viewportHeight;
uniform float u_minScreenSize;
uniform float u_nodeSizeScale;

out vec2 v_uv;
out vec4 v_color;
flat out float v_highlight;

void main() {
  if (a_visible < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  float scale = 1.0;
  float hl = 0.0;
  int id = gl_InstanceID + u_instanceOffset;
  // Selected: slight scale pop (rare). Hover: **no** scale change — only rim tint below — otherwise
  // the cursor sweep constantly retargets hover and 1.2× resizing reads as “everything shakes”.
  if (id == u_selectedId) { scale = 1.35; hl = 1.0; }
  else if (id == u_hoveredId) { hl = 0.55; }

  vec4 viewCenter = u_view * vec4(a_center, 1.0);
  float naturalWorld = a_size * scale * u_nodeSizeScale;

  // Minimum screen-space diameter — blend smoothly so tiny depth / FP changes
  // do not pop worldSize between two formulas (visible as jitter).
  float depthSafe = max(-viewCenter.z, 0.001);
  float projScale = u_proj[1][1] * u_viewportHeight * 0.5;
  float screenPxNatural = naturalWorld * projScale / depthSafe;
  float clampedWorld = u_minScreenSize * depthSafe / projScale;
  float band = max(1.0, u_minScreenSize * 0.25);
  float t = smoothstep(u_minScreenSize - band, u_minScreenSize + band, screenPxNatural);
  float worldSize = mix(clampedWorld, naturalWorld, t);

  viewCenter.xy += a_quad * worldSize;
  gl_Position = u_proj * viewCenter;

  // Stable tie-break when many billboard discs overlap at nearly the same depth
  // (avoids z-fighting shimmer that reads as “nodes shaking”).
  gl_Position.z -= float(id & 4095) * (1.0 / 16777216.0) * gl_Position.w;

  v_uv = a_quad;
  v_color = a_color;
  v_highlight = hl;
}`;

const FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
in vec4 v_color;
flat in float v_highlight;
out vec4 fragColor;

void main() {
  float r2 = dot(v_uv, v_uv);
  if (r2 > 0.25) discard;

  float r = sqrt(r2) * 2.0;
  float nz = sqrt(1.0 - r * r);

  vec3 normal = vec3(v_uv * 2.0, nz);
  vec3 light = normalize(vec3(0.3, 0.8, 0.6));
  float diffuse = max(dot(normal, light), 0.0);
  float ambient = 0.35;
  float rim = 1.0 - smoothstep(0.6, 1.0, r);

  vec3 color = v_color.rgb * (ambient + diffuse * 0.65) + rim * 0.04;
  color = mix(color, vec3(1.0), v_highlight * 0.45);

  float edge = 1.0 - smoothstep(0.44, 0.5, sqrt(r2));
  fragColor = vec4(color, v_color.a * edge);
}`;

// ── Unit quad (triangle strip) ─────────────────────────────────────

const QUAD_VERTS = new Float32Array([
  -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5,
]);

// ── Uniform names ──────────────────────────────────────────────────

const UNIFORM_NAMES = [
  'u_view',
  'u_proj',
  'u_hoveredId',
  'u_selectedId',
  'u_instanceOffset',
  'u_viewportHeight',
  'u_minScreenSize',
  'u_nodeSizeScale',
] as const;

// ── Renderer ───────────────────────────────────────────────────────

export class NodeRenderer {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly quadBuffer: WebGLBuffer;
  private readonly uniforms: Record<
    (typeof UNIFORM_NAMES)[number],
    WebGLUniformLocation | null
  >;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly graphBuffers: GraphBuffers,
  ) {
    this.program = linkProgram(gl, VERT, FRAG);
    this.uniforms = getUniformLocations(gl, this.program, UNIFORM_NAMES);

    const vao = gl.createVertexArray();
    if (!vao) throw new Error('gl.createVertexArray returned null');
    this.vao = vao;
    gl.bindVertexArray(vao);

    // loc 0 — quad corner (per-vertex)
    this.quadBuffer = createStaticBuffer(gl, gl.ARRAY_BUFFER, QUAD_VERTS);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // loc 1 — instance center (vec3, float)
    gl.bindBuffer(gl.ARRAY_BUFFER, graphBuffers.position);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);

    // loc 2 — instance color (vec4, ubyte normalized)
    gl.bindBuffer(gl.ARRAY_BUFFER, graphBuffers.color);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.vertexAttribDivisor(2, 1);

    // loc 3 — instance size (float)
    gl.bindBuffer(gl.ARRAY_BUFFER, graphBuffers.size);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(3, 1);

    // loc 4 — instance visibility (ubyte → float, NOT normalized: 1 must stay 1.0)
    gl.bindBuffer(gl.ARRAY_BUFFER, graphBuffers.nodeVisibility);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.UNSIGNED_BYTE, false, 0, 0);
    gl.vertexAttribDivisor(4, 1);

    gl.bindVertexArray(null);
  }

  /**
   * Draw all nodes in one call (no chunking).
   */
  /** Minimum screen-space diameter in pixels. Nodes never shrink below this. */
  minScreenSize = 2.0;

  draw(
    camera: Camera,
    nodeCount: number,
    viewportHeight: number,
    hoveredId = -1,
    selectedId = -1,
    nodeSizeScale = 1,
  ): void {
    if (nodeCount === 0) return;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.u_view, false, camera.view);
    gl.uniformMatrix4fv(this.uniforms.u_proj, false, camera.projection);
    gl.uniform1i(this.uniforms.u_hoveredId, hoveredId);
    gl.uniform1i(this.uniforms.u_selectedId, selectedId);
    gl.uniform1i(this.uniforms.u_instanceOffset, 0);
    gl.uniform1f(this.uniforms.u_viewportHeight, viewportHeight);
    gl.uniform1f(this.uniforms.u_minScreenSize, this.minScreenSize);
    gl.uniform1f(this.uniforms.u_nodeSizeScale, nodeSizeScale);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nodeCount);
    gl.bindVertexArray(null);
  }

  /**
   * Draw a chunk of nodes at a given instance offset.
   * Call beginDraw() once, then drawChunk() per visible chunk, then endDraw().
   */
  beginDraw(
    camera: Camera,
    viewportHeight: number,
    hoveredId = -1,
    selectedId = -1,
    nodeSizeScale = 1,
  ): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.u_view, false, camera.view);
    gl.uniformMatrix4fv(this.uniforms.u_proj, false, camera.projection);
    gl.uniform1i(this.uniforms.u_hoveredId, hoveredId);
    gl.uniform1i(this.uniforms.u_selectedId, selectedId);
    gl.uniform1f(this.uniforms.u_viewportHeight, viewportHeight);
    gl.uniform1f(this.uniforms.u_minScreenSize, this.minScreenSize);
    gl.uniform1f(this.uniforms.u_nodeSizeScale, nodeSizeScale);
    gl.bindVertexArray(this.vao);
  }

  drawChunk(offset: number, count: number): void {
    if (count === 0) return;
    const gl = this.gl;
    const buf = this.graphBuffers;

    gl.uniform1i(this.uniforms.u_instanceOffset, offset);

    gl.bindBuffer(gl.ARRAY_BUFFER, buf.position);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, offset * 12);

    gl.bindBuffer(gl.ARRAY_BUFFER, buf.color);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 0, offset * 4);

    gl.bindBuffer(gl.ARRAY_BUFFER, buf.size);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, offset * 4);

    gl.bindBuffer(gl.ARRAY_BUFFER, buf.nodeVisibility);
    gl.vertexAttribPointer(4, 1, gl.UNSIGNED_BYTE, false, 0, offset);

    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
  }

  endDraw(): void {
    this.gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.quadBuffer);
  }
}
