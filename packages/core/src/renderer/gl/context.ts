/** Options forwarded to `canvas.getContext('webgl2', ...)`. */
export interface ContextOptions {
  alpha?: boolean;
  antialias?: boolean;
  preserveDrawingBuffer?: boolean;
  powerPreference?: WebGLPowerPreference;
}

/** Create a WebGL2 context with sensible defaults. Throws if unsupported. */
export function createWebGL2Context(
  canvas: HTMLCanvasElement,
  options: ContextOptions = {},
): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', {
    alpha: options.alpha ?? false,
    // MSAA + `discard` on billboard discs causes unstable coverage → visible shimmer (“shake”).
    // Opt in via `contextOptions: { antialias: true }` if you add post AA instead.
    antialias: options.antialias ?? false,
    depth: true,
    stencil: false,
    premultipliedAlpha: true,
    powerPreference: options.powerPreference ?? 'high-performance',
    preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
  });
  if (!gl) {
    throw new Error('WebGL2 is not supported in this browser.');
  }

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(
    gl.SRC_ALPHA,
    gl.ONE_MINUS_SRC_ALPHA,
    gl.ONE,
    gl.ONE_MINUS_SRC_ALPHA,
  );
  gl.clearColor(0.06, 0.07, 0.09, 1);
  gl.clearDepth(1);

  return gl;
}
