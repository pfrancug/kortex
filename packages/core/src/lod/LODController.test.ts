import { describe, it, expect } from 'vitest';
import { LODController } from './LODController';

describe('LODController', () => {
  it('returns 0 when edge count exceeds budget', () => {
    const lod = new LODController({ edgeBudget: 100 });
    expect(lod.getEffectiveEdgeCount(200)).toBe(0);
  });

  it('returns total count when within budget', () => {
    const lod = new LODController({ edgeBudget: 500 });
    expect(lod.getEffectiveEdgeCount(200)).toBe(200);
  });

  it('returns sample budget when edges exceed sample budget', () => {
    const lod = new LODController({ edgeSampleBudget: 50 });
    expect(lod.getEffectiveEdgeCount(200)).toBe(50);
  });

  it('stores edgeMaxDistance setting', () => {
    const lod = new LODController({ edgeMaxDistance: 30 });
    expect(lod.settings.edgeMaxDistance).toBe(30);
  });

  it('defaults edgeMaxDistance to 0 (unlimited)', () => {
    const lod = new LODController();
    expect(lod.settings.edgeMaxDistance).toBe(0);
  });

  it('progressive chunk limit advances each frame', () => {
    const lod = new LODController({ progressiveChunksPerFrame: 2 });
    expect(lod.getProgressiveChunkLimit()).toBe(0);
    lod.advanceProgressive(10);
    expect(lod.getProgressiveChunkLimit()).toBe(2);
    lod.advanceProgressive(10);
    expect(lod.getProgressiveChunkLimit()).toBe(4);
  });

  it('builds deterministic edge sample mask', () => {
    const lod = new LODController();
    const mask1 = lod.buildEdgeSampleMask(100, 10, 42);
    const mask2 = lod.buildEdgeSampleMask(100, 10, 42);

    let count = 0;
    for (let i = 0; i < 100; i++) {
      expect(mask1[i]).toBe(mask2[i]);
      count += mask1[i];
    }
    expect(count).toBe(10);
  });

  it('different seeds produce different masks', () => {
    const lod = new LODController();
    const mask1 = lod.buildEdgeSampleMask(100, 10, 42);
    const mask2 = lod.buildEdgeSampleMask(100, 10, 99);

    let same = 0;
    for (let i = 0; i < 100; i++) {
      if (mask1[i] === mask2[i]) same++;
    }
    expect(same).toBeLessThan(100);
  });
});
