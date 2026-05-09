import type { Camera } from './Camera';
import type { SdfAtlasData, GlyphMetrics } from './SdfAtlas';
import { linkProgram, getUniformLocations } from './gl/shader';

// ── Shaders ────────────────────────────────────────────────────────

const VERT = `#version 300 es
layout(location = 0) in vec2  a_quad;       // unit quad corner (0,0)–(1,1)
layout(location = 1) in vec3  a_anchor;    // world-space node center
layout(location = 2) in vec4  a_uvRect;    // glyph UV: x, y, w, h (normalized)
layout(location = 3) in vec2  a_pen;       // glyph origin: x = cursor (em), y = baseline lift (em)
layout(location = 4) in float a_advance;   // glyph width in em (matches spacing)
layout(location = 5) in float a_nodeRadius; // raw store radius

uniform mat4  u_view;
uniform mat4  u_proj;
uniform float u_labelScale;
uniform float u_lineHeightEm;
uniform float u_labelGlyphScale;
uniform float u_discBillboardScale;
uniform float u_viewportHeight;
uniform float u_minScreenSize;

out vec2 v_uv;

void main() {
  float gMul = clamp(max(u_labelGlyphScale, 1e-6), 0.05, 2500.0);
  float s = u_labelScale * gMul;
  vec2 local = a_pen + a_quad * vec2(a_advance, u_lineHeightEm);
  vec2 offset = local * s;

  mat3 R = mat3(u_view);
  mat3 Ri = transpose(R);
  vec3 camRight = Ri[0];
  vec3 camUp = Ri[1];

  vec4 viewAnchor = u_view * vec4(a_anchor, 1.0);
  float discMul = max(u_discBillboardScale, 1e-6);
  float naturalWorld = max(a_nodeRadius * discMul, 1e-6);

  float depthSafe = max(-viewAnchor.z, 0.001);
  float projScale = u_proj[1][1] * u_viewportHeight * 0.5;
  float screenPxNatural = naturalWorld * projScale / depthSafe;
  float clampedWorld = u_minScreenSize * depthSafe / projScale;
  float band = max(1.0, u_minScreenSize * 0.25);
  float t = smoothstep(u_minScreenSize - band, u_minScreenSize + band, screenPxNatural);
  // Matches NodeRenderer: quad corners are ±0.5 × billboardSpan → rim radius = span / 2 in view XY.
  float billboardSpan = mix(clampedWorld, naturalWorld, t);
  float rimR = max(billboardSpan * 0.5, 1e-6);

  // Glyphs extend downward from baseline (-camUp * offset.y); worst vertex uses pen.y + lineHeightEm.
  float glyphBottom = (a_pen.y + u_lineHeightEm) * s;
  float anchorLift = rimR + glyphBottom + max(rimR * 0.08, s * 0.06);

  vec3 anchorLifted = a_anchor + camUp * anchorLift;

  vec3 worldPos = anchorLifted + camRight * offset.x - camUp * offset.y;
  gl_Position = u_proj * u_view * vec4(worldPos, 1.0);

  v_uv = a_uvRect.xy + a_quad * a_uvRect.zw;
}`;

const FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_atlas;
uniform vec4      u_color;

out vec4 fragColor;

void main() {
  float dist = texture(u_atlas, v_uv).r;

  float edge = 0.5;
  float delta = fwidth(dist) * 1.2;
  float alpha = smoothstep(edge - delta, edge + delta, dist);

  if (alpha < 0.01) discard;

  fragColor = vec4(u_color.rgb, u_color.a * alpha);
}`;

// ── Constants ──────────────────────────────────────────────────────

const UNIFORM_NAMES = [
  'u_view',
  'u_proj',
  'u_atlas',
  'u_color',
  'u_labelScale',
  'u_lineHeightEm',
  'u_labelGlyphScale',
  'u_discBillboardScale',
  'u_viewportHeight',
  'u_minScreenSize',
] as const;

const QUAD_VERTS = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);

const MAX_CHARS = 500_000;

/** Fallback when sizes buffer is shorter than node index (aligned with {@link GraphStore} default radius). */
const FALLBACK_NODE_RADIUS = 1;

/** anchor(3) + uvRect(4) + pen(2) + advance(1) + nodeRadius(1) = 11 floats */
const FLOATS_PER_CHAR = 11;
const BYTES_PER_CHAR = FLOATS_PER_CHAR * 4;

// ── Renderer ───────────────────────────────────────────────────────

export class LabelRenderer {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly quadBuffer: WebGLBuffer;
  private readonly instanceBuffer: WebGLBuffer;
  private readonly uniforms: Record<
    (typeof UNIFORM_NAMES)[number],
    WebGLUniformLocation | null
  >;

  private instanceData = new Float32Array(0);
  private charCount = 0;

  /**
   * Baseline world glyph scale when {@link labelGlyphScale} = 1; shader multiplies glyphs by {@link labelGlyphScale}.
   * Vertical lift uses {@link discBillboardScale} so text sits on the same rim as node billboards.
   */
  labelScale = 0.52;

  /** Vertical extent per glyph in em (matches atlas cell ~ FONT_SIZE + padding). */
  labelLineHeightEm = 1.22;

  /** Label text color (RGBA, 0–1). */
  color: [number, number, number, number] = [1, 1, 1, 1];

  /**
   * Passed as `u_labelGlyphScale`; boosted vs discs when auto-fit divides by typical radius.
   */
  labelGlyphScale = 1;

  /**
   * Same multiplier as node billboards ({@link Renderer} frame `nodeMul`); used only for disc rim / vertical anchor lift.
   */
  discBillboardScale = 1;

  /**
   * Default minimum screen-space disc diameter (px) — same semantics as {@link NodeRenderer.minScreenSize}.
   * {@link Renderer} passes the active node renderer’s value into {@link draw}.
   */
  minScreenSize = 2;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly atlas: SdfAtlasData,
  ) {
    this.program = linkProgram(gl, VERT, FRAG);
    this.uniforms = getUniformLocations(gl, this.program, UNIFORM_NAMES);

    this.quadBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTS, gl.STATIC_DRAW);

    this.instanceBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_CHARS * BYTES_PER_CHAR, gl.DYNAMIC_DRAW);

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);

    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, BYTES_PER_CHAR, 0);
    gl.vertexAttribDivisor(1, 1);

    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, BYTES_PER_CHAR, 12);
    gl.vertexAttribDivisor(2, 1);

    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, BYTES_PER_CHAR, 28);
    gl.vertexAttribDivisor(3, 1);

    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, BYTES_PER_CHAR, 36);
    gl.vertexAttribDivisor(4, 1);

    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 1, gl.FLOAT, false, BYTES_PER_CHAR, 40);
    gl.vertexAttribDivisor(5, 1);

    gl.bindVertexArray(null);
  }

  /**
   * Build the instance buffer from node positions and label strings.
   * When {@link visibleIndices} is set, scan that list (LOD); otherwise scan node index order.
   * Skips nodes with {@link nodeVisibility}[i] === 0 (e.g. degree/weight filters).
   */
  buildLabels(
    positions: Float32Array,
    sizes: Float32Array,
    labels: string[],
    visibleIndices: Uint32Array | null,
    maxLabels: number,
    nodeVisibility?: Uint8Array | null,
  ): void {
    const hardCap = Math.min(maxLabels, MAX_CHARS / 20);
    const nv = nodeVisibility;

    const hidden = (idx: number): boolean =>
      nv !== null && nv !== undefined && idx < nv.length && nv[idx] === 0;

    let totalChars = 0;
    let counted = 0;

    if (visibleIndices) {
      for (let i = 0; i < visibleIndices.length && counted < hardCap; i++) {
        const idx = visibleIndices[i];
        if (hidden(idx)) continue;
        totalChars += labels[idx]?.length ?? 0;
        counted++;
      }
    } else {
      for (let idx = 0; idx < labels.length && counted < hardCap; idx++) {
        if (hidden(idx)) continue;
        totalChars += labels[idx]?.length ?? 0;
        counted++;
      }
    }

    if (this.instanceData.length < totalChars * FLOATS_PER_CHAR) {
      this.instanceData = new Float32Array(totalChars * FLOATS_PER_CHAR);
    }

    const atlasW = this.atlas.width;
    const atlasH = this.atlas.height;
    let offset = 0;

    /** Baseline lift in em along billboard “up” after world-space anchor lift from sphere radius. */
    const penY = 0.38;

    let emitted = 0;

    const nodeR = (idx: number): number =>
      idx < sizes.length ? sizes[idx]! : FALLBACK_NODE_RADIUS;

    if (visibleIndices) {
      for (let i = 0; i < visibleIndices.length && emitted < hardCap; i++) {
        const idx = visibleIndices[i];
        if (hidden(idx)) continue;

        const text = labels[idx];
        if (!text) continue;

        const px = positions[idx * 3];
        const py = positions[idx * 3 + 1];
        const pz = positions[idx * 3 + 2];
        const nr = nodeR(idx);

        let textWidth = 0;
        for (let c = 0; c < text.length; c++) {
          const g = this.atlas.glyphs.get(text.charCodeAt(c));
          if (g) textWidth += g.advance;
        }
        let cursorX = -textWidth * 0.5;

        for (let c = 0; c < text.length; c++) {
          const g = this.atlas.glyphs.get(text.charCodeAt(c)) as
            | GlyphMetrics
            | undefined;
          if (!g) continue;

          const d = this.instanceData;
          const o = offset * FLOATS_PER_CHAR;

          d[o] = px;
          d[o + 1] = py;
          d[o + 2] = pz;

          d[o + 3] = g.x / atlasW;
          d[o + 4] = g.y / atlasH;
          d[o + 5] = g.w / atlasW;
          d[o + 6] = g.h / atlasH;

          d[o + 7] = cursorX;
          d[o + 8] = penY;

          d[o + 9] = g.advance;
          d[o + 10] = nr;

          cursorX += g.advance;
          offset++;
        }
        emitted++;
      }
    } else {
      for (let idx = 0; idx < labels.length && emitted < hardCap; idx++) {
        if (hidden(idx)) continue;

        const text = labels[idx];
        if (!text) continue;

        const px = positions[idx * 3];
        const py = positions[idx * 3 + 1];
        const pz = positions[idx * 3 + 2];
        const nr = nodeR(idx);

        let textWidth = 0;
        for (let c = 0; c < text.length; c++) {
          const g = this.atlas.glyphs.get(text.charCodeAt(c));
          if (g) textWidth += g.advance;
        }
        let cursorX = -textWidth * 0.5;

        for (let c = 0; c < text.length; c++) {
          const g = this.atlas.glyphs.get(text.charCodeAt(c)) as
            | GlyphMetrics
            | undefined;
          if (!g) continue;

          const d = this.instanceData;
          const o = offset * FLOATS_PER_CHAR;

          d[o] = px;
          d[o + 1] = py;
          d[o + 2] = pz;

          d[o + 3] = g.x / atlasW;
          d[o + 4] = g.y / atlasH;
          d[o + 5] = g.w / atlasW;
          d[o + 6] = g.h / atlasH;

          d[o + 7] = cursorX;
          d[o + 8] = penY;

          d[o + 9] = g.advance;
          d[o + 10] = nr;

          cursorX += g.advance;
          offset++;
        }
        emitted++;
      }
    }

    this.charCount = offset;

    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      0,
      this.instanceData,
      0,
      offset * FLOATS_PER_CHAR,
    );
  }

  draw(
    camera: Camera,
    viewportHeight: number,
    minScreenDiameterPx: number,
  ): void {
    if (this.charCount === 0) return;

    const gl = this.gl;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Respect depth from nodes/edges so labels behind nearer geometry stay hidden.
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.u_view, false, camera.view);
    gl.uniformMatrix4fv(this.uniforms.u_proj, false, camera.projection);
    gl.uniform1f(this.uniforms.u_labelScale, this.labelScale);
    gl.uniform1f(this.uniforms.u_lineHeightEm, this.labelLineHeightEm);
    gl.uniform1f(this.uniforms.u_labelGlyphScale, this.labelGlyphScale);
    gl.uniform1f(this.uniforms.u_discBillboardScale, this.discBillboardScale);
    gl.uniform1f(this.uniforms.u_viewportHeight, viewportHeight);
    gl.uniform1f(this.uniforms.u_minScreenSize, minScreenDiameterPx);
    gl.uniform4f(
      this.uniforms.u_color,
      this.color[0],
      this.color[1],
      this.color[2],
      this.color[3],
    );

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas.texture);
    gl.uniform1i(this.uniforms.u_atlas, 0);

    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.charCount);
    gl.bindVertexArray(null);

    gl.depthMask(true);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
      gl.SRC_ALPHA,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
    );
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.quadBuffer);
    gl.deleteBuffer(this.instanceBuffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
  }
}
