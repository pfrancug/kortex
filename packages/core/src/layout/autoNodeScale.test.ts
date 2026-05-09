import { describe, expect, it } from 'vitest';
import {
  axisAlignedExtent,
  suggestedNodeSizeMultiplierFromLayout,
  typicalStoredRadius,
} from './autoNodeScale';

describe('autoNodeScale', () => {
  it('axisAlignedExtent uses longest bbox edge', () => {
    const p = new Float32Array([0, 0, 0, 10, 2, 1]);
    expect(axisAlignedExtent(p, 2)).toBe(10);
  });

  it('typicalStoredRadius returns median for small arrays', () => {
    const s = new Float32Array([1, 9, 3]);
    expect(typicalStoredRadius(s, 3)).toBe(3);
  });

  it('suggested multiplier rises with spatial extent at fixed N', () => {
    const n = 500;
    const sizes = new Float32Array(n);
    sizes.fill(1);

    const tight = new Float32Array(n * 3);
    tight.fill(0);

    const wide = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      wide[i * 3] = i * 0.5;
      wide[i * 3 + 1] = 0;
      wide[i * 3 + 2] = 0;
    }

    const mTight = suggestedNodeSizeMultiplierFromLayout(tight, n, sizes);
    const mWide = suggestedNodeSizeMultiplierFromLayout(wide, n, sizes);
    expect(mWide).toBeGreaterThan(mTight);
  });

  it('suggested multiplier is finite and clamped', () => {
    const n = 20;
    const p = new Float32Array(n * 3);
    const s = new Float32Array(n);
    s.fill(1);
    const m = suggestedNodeSizeMultiplierFromLayout(p, n, s);
    expect(Number.isFinite(m)).toBe(true);
    expect(m).toBeGreaterThanOrEqual(0.03);
    expect(m).toBeLessThanOrEqual(180);
  });
});
