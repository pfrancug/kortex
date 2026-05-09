/**
 * Generates a Signed Distance Field glyph atlas from a Canvas2D font rendering.
 * Produces a single-channel texture where each texel stores the distance to the
 * nearest glyph edge. This allows crisp text rendering at any zoom via the GPU.
 */

export interface GlyphMetrics {
  /** Character code point. */
  char: number;
  /** X position in atlas (pixels). */
  x: number;
  /** Y position in atlas (pixels). */
  y: number;
  /** Glyph cell width in atlas (pixels). */
  w: number;
  /** Glyph cell height in atlas (pixels). */
  h: number;
  /** Horizontal advance (in font-size units, 0–1). */
  advance: number;
}

export interface SdfAtlasData {
  texture: WebGLTexture;
  width: number;
  height: number;
  glyphs: Map<number, GlyphMetrics>;
  lineHeight: number;
}

const FONT_SIZE = 48;
const SDF_PADDING = 6;
const SDF_RADIUS = 8;
const GLYPH_CELL = FONT_SIZE + SDF_PADDING * 2;
const FIRST_CHAR = 32;
const LAST_CHAR = 126;
const CHAR_COUNT = LAST_CHAR - FIRST_CHAR + 1;

export function createSdfAtlas(gl: WebGL2RenderingContext): SdfAtlasData {
  const cols = Math.ceil(Math.sqrt(CHAR_COUNT));
  const rows = Math.ceil(CHAR_COUNT / cols);
  const atlasW = cols * GLYPH_CELL;
  const atlasH = rows * GLYPH_CELL;

  const canvas = document.createElement('canvas');
  canvas.width = atlasW;
  canvas.height = atlasH;
  const ctx = canvas.getContext('2d')!;

  ctx.font = `${FONT_SIZE}px monospace`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'white';

  const glyphs = new Map<number, GlyphMetrics>();

  for (let i = 0; i < CHAR_COUNT; i++) {
    const code = FIRST_CHAR + i;
    const ch = String.fromCharCode(code);
    const col = i % cols;
    const row = (i / cols) | 0;
    const x = col * GLYPH_CELL;
    const y = row * GLYPH_CELL;

    ctx.fillText(ch, x + SDF_PADDING, y + SDF_PADDING);

    const measured = ctx.measureText(ch);
    glyphs.set(code, {
      char: code,
      x,
      y,
      w: GLYPH_CELL,
      h: GLYPH_CELL,
      advance: measured.width / FONT_SIZE,
    });
  }

  const imageData = ctx.getImageData(0, 0, atlasW, atlasH);
  const sdf = computeSdf(imageData.data, atlasW, atlasH, SDF_RADIUS);

  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.R8,
    atlasW,
    atlasH,
    0,
    gl.RED,
    gl.UNSIGNED_BYTE,
    sdf,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return {
    texture,
    width: atlasW,
    height: atlasH,
    glyphs,
    lineHeight: 1.0,
  };
}

/**
 * Compute an SDF from a rasterized RGBA image. Uses a brute-force
 * approach within a search radius for simplicity and correctness.
 */
function computeSdf(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number,
): Uint8Array {
  const out = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inside = rgba[(y * w + x) * 4 + 3] > 127;
      let minDist = radius;

      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w - 1, x + radius);
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(h - 1, y + radius);

      for (let sy = y0; sy <= y1; sy++) {
        for (let sx = x0; sx <= x1; sx++) {
          const otherInside = rgba[(sy * w + sx) * 4 + 3] > 127;
          if (otherInside !== inside) {
            const dx = sx - x;
            const dy = sy - y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < minDist) minDist = d;
          }
        }
      }

      const normalized = minDist / radius;
      const value = inside ? 0.5 + normalized * 0.5 : 0.5 - normalized * 0.5;
      out[y * w + x] = (Math.min(1, Math.max(0, value)) * 255 + 0.5) | 0;
    }
  }

  return out;
}

/** Measure the width of a string in font-size units. */
export function measureText(atlas: SdfAtlasData, text: string): number {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    const g = atlas.glyphs.get(text.charCodeAt(i));
    if (g) w += g.advance;
  }
  return w;
}
