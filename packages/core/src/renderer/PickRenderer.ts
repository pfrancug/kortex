import type { Camera } from './Camera';
import type { GraphBuffers } from '../graph/GraphStore';
import { linkProgram, getUniformLocations } from './gl/shader';
import { createStaticBuffer } from './gl/buffer';

// ── Pick shaders ───────────────────────────────────────────────────

const VERT = `#version 300 es
layout(location = 0) in vec2 a_quad;
layout(location = 1) in vec3 a_center;
layout(location = 2) in float a_size;
layout(location = 3) in float a_visible;

uniform mat4 u_view;
uniform mat4 u_proj;

flat out uint v_id;
out vec2 v_uv;

void main() {
  v_id = uint(gl_InstanceID) + 1u;

  if (a_visible < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  vec4 viewCenter = u_view * vec4(a_center, 1.0);
  viewCenter.xy += a_quad * a_size;
  gl_Position = u_proj * viewCenter;

  int uid = gl_InstanceID;
  gl_Position.z -= float(uid & 4095) * (1.0 / 16777216.0) * gl_Position.w;

  v_uv = a_quad;
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp usampler2D;

flat in uint v_id;
in vec2 v_uv;
layout(location = 0) out uint fragId;

void main() {
  if (dot(v_uv, v_uv) > 0.25) discard;
  fragId = v_id;
}`;

// ── Quad ───────────────────────────────────────────────────────────

const QUAD_VERTS = new Float32Array([
  -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5,
]);

const UNIFORM_NAMES = ['u_view', 'u_proj'] as const;

// ── PickRenderer ───────────────────────────────────────────────────

export class PickRenderer {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly quadBuffer: WebGLBuffer;
  private readonly uniforms: Record<
    (typeof UNIFORM_NAMES)[number],
    WebGLUniformLocation | null
  >;

  private fbo: WebGLFramebuffer;
  private colorTex: WebGLTexture;
  private depthRb: WebGLRenderbuffer;
  private fboWidth = 0;
  private fboHeight = 0;
  private readonly readBuf = new Uint32Array(1);

  constructor(
    private readonly gl: WebGL2RenderingContext,
    graphBuffers: GraphBuffers,
  ) {
    this.program = linkProgram(gl, VERT, FRAG);
    this.uniforms = getUniformLocations(gl, this.program, UNIFORM_NAMES);

    const vao = gl.createVertexArray();
    if (!vao) throw new Error('createVertexArray returned null');
    this.vao = vao;
    gl.bindVertexArray(vao);

    this.quadBuffer = createStaticBuffer(gl, gl.ARRAY_BUFFER, QUAD_VERTS);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // loc 1 — position
    gl.bindBuffer(gl.ARRAY_BUFFER, graphBuffers.position);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);

    // loc 2 — size (skip color, not needed for pick)
    gl.bindBuffer(gl.ARRAY_BUFFER, graphBuffers.size);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(2, 1);

    // loc 3 — visibility
    gl.bindBuffer(gl.ARRAY_BUFFER, graphBuffers.nodeVisibility);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.UNSIGNED_BYTE, false, 0, 0);
    gl.vertexAttribDivisor(3, 1);

    gl.bindVertexArray(null);

    // FBO (created at 1x1, resized on first pick)
    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error('createFramebuffer returned null');
    this.fbo = fbo;

    const tex = gl.createTexture();
    if (!tex) throw new Error('createTexture returned null');
    this.colorTex = tex;

    const rb = gl.createRenderbuffer();
    if (!rb) throw new Error('createRenderbuffer returned null');
    this.depthRb = rb;
  }

  /**
   * Render the pick buffer and read the pixel at (x, y).
   * Returns node index (0-based) or -1 if background.
   */
  pick(
    camera: Camera,
    nodeCount: number,
    x: number,
    y: number,
    viewportWidth: number,
    viewportHeight: number,
  ): number {
    if (nodeCount === 0) return -1;
    const gl = this.gl;

    // Half-res pick buffer: same aspect as the canvas, ~¼ fill/readPixels cost vs full size.
    const pw = Math.max(1, viewportWidth >> 1);
    const ph = Math.max(1, viewportHeight >> 1);

    this.ensureFboSize(pw, ph);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.fboWidth, this.fboHeight);
    gl.clearBufferuiv(gl.COLOR, 0, new Uint32Array([0, 0, 0, 0]));
    gl.clearBufferfi(gl.DEPTH_STENCIL, 0, 1.0, 0);

    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uniforms.u_view, false, camera.view);
    gl.uniformMatrix4fv(this.uniforms.u_proj, false, camera.projection);

    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nodeCount);
    gl.bindVertexArray(null);

    const rx = Math.min(pw - 1, Math.floor((x * pw) / viewportWidth));
    const ry = Math.min(ph - 1, Math.floor((y * ph) / viewportHeight));
    const glY = ph - 1 - ry;
    gl.readPixels(rx, glY, 1, 1, gl.RED_INTEGER, gl.UNSIGNED_INT, this.readBuf);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, viewportWidth, viewportHeight);
    gl.enable(gl.BLEND);

    const id = this.readBuf[0];
    return id > 0 ? id - 1 : -1;
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.program);
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.quadBuffer);
    gl.deleteFramebuffer(this.fbo);
    gl.deleteTexture(this.colorTex);
    gl.deleteRenderbuffer(this.depthRb);
  }

  private ensureFboSize(w: number, h: number): void {
    if (w === this.fboWidth && h === this.fboHeight) return;
    this.fboWidth = w;
    this.fboHeight = h;
    const gl = this.gl;

    gl.bindTexture(gl.TEXTURE_2D, this.colorTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R32UI,
      w,
      h,
      0,
      gl.RED_INTEGER,
      gl.UNSIGNED_INT,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, w, h);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.colorTex,
      0,
    );
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.DEPTH_STENCIL_ATTACHMENT,
      gl.RENDERBUFFER,
      this.depthRb,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}
