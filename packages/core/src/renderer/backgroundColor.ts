/** Matches previous {@link createWebGL2Context} default (`rgb(15,18,23)`). */
export const DEFAULT_BACKGROUND_COLOR =
  '#0f1217' as const satisfies BackgroundColor;

/** CSS **`#RGB`**, **`#RRGGBB`**, **`#RRGGBBAA`**, or linear **0–1** `[r,g,b]` / `[r,g,b,a]`. */
export type BackgroundColor =
  | string
  | readonly [number, number, number]
  | readonly [number, number, number, number];

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(Math.max(x, 0), 1);
}

function bytePair01(pair: string): number | null {
  const n = parseInt(pair, 16);
  if (!Number.isFinite(n) || n < 0 || n > 255) return null;
  return n / 255;
}

/** Parse **`#RGB`**, **`#RRGGBB`**, **`#RRGGBBAA`** → linear RGBA. Returns **`null`** if invalid. */
export function parseCssHexBackground(
  s: string,
): readonly [number, number, number, number] | null {
  const t = s.trim();
  if (!t.startsWith('#')) return null;
  const hex = t.slice(1);
  const expand = (c: string): number | null => bytePair01(c + c);
  if (hex.length === 3) {
    const r = expand(hex[0]!);
    const g = expand(hex[1]!);
    const b = expand(hex[2]!);
    if (r === null || g === null || b === null) return null;
    return [r, g, b, 1];
  }
  if (hex.length === 6) {
    const r = bytePair01(hex.slice(0, 2));
    const g = bytePair01(hex.slice(2, 4));
    const b = bytePair01(hex.slice(4, 6));
    if (r === null || g === null || b === null) return null;
    return [r, g, b, 1];
  }
  if (hex.length === 8) {
    const r = bytePair01(hex.slice(0, 2));
    const g = bytePair01(hex.slice(2, 4));
    const b = bytePair01(hex.slice(4, 6));
    const a = bytePair01(hex.slice(6, 8));
    if (r === null || g === null || b === null || a === null) return null;
    return [r, g, b, a];
  }
  return null;
}

/** Normalize to linear RGBA **0–1** for `gl.clearColor`. Invalid strings → {@link DEFAULT_BACKGROUND_COLOR}. */
export function normalizeBackgroundColor(
  input: BackgroundColor | undefined,
): readonly [number, number, number, number] {
  if (input === undefined) {
    return normalizeBackgroundColor(DEFAULT_BACKGROUND_COLOR);
  }
  if (typeof input !== 'string') {
    const r = clamp01(input[0]!);
    const g = clamp01(input[1]!);
    const b = clamp01(input[2]!);
    const a = input.length >= 4 ? clamp01(input[3]!) : 1;
    return [r, g, b, a];
  }
  const parsed = parseCssHexBackground(input);
  if (parsed) return parsed;
  return normalizeBackgroundColor(DEFAULT_BACKGROUND_COLOR);
}
