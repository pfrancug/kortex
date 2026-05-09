/** Create a `STATIC_DRAW` buffer and upload `data`. */
export function createStaticBuffer(
  gl: WebGL2RenderingContext,
  target: GLenum,
  data: ArrayBufferView,
): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('gl.createBuffer returned null');
  gl.bindBuffer(target, buffer);
  gl.bufferData(target, data, gl.STATIC_DRAW);
  return buffer;
}

/** Create an empty `DYNAMIC_DRAW` buffer of given byte length. */
export function createDynamicBuffer(
  gl: WebGL2RenderingContext,
  target: GLenum,
  byteLength: number,
): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('gl.createBuffer returned null');
  gl.bindBuffer(target, buffer);
  gl.bufferData(target, byteLength, gl.DYNAMIC_DRAW);
  return buffer;
}

/** Upload `data` into `buffer` at `byteOffset` via `bufferSubData`. */
export function updateBufferRange(
  gl: WebGL2RenderingContext,
  target: GLenum,
  buffer: WebGLBuffer,
  byteOffset: number,
  data: ArrayBufferView,
): void {
  gl.bindBuffer(target, buffer);
  gl.bufferSubData(target, byteOffset, data);
}
