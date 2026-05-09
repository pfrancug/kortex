import { describe, it, expect } from 'vitest';
import { ClusterLOD } from './ClusterLOD';

describe('ClusterLOD', () => {
  const positions = new Float32Array([
    0, 0, 0, 0.1, 0.1, 0.1, 5, 5, 5, 5.1, 5.1, 5.1, 10, 10, 10,
  ]);

  it('builds multiple levels with increasing cell size', () => {
    const lod = new ClusterLOD();
    lod.build(positions, 5, 1.0);

    expect(lod.levels.length).toBeGreaterThan(1);
    expect(lod.levels[0].cellSize).toBe(1.0);
    expect(lod.levels[1].cellSize).toBe(2.0);
  });

  it('fine level clusters nearby nodes together', () => {
    const lod = new ClusterLOD();
    lod.build(positions, 5, 1.0);

    const level0 = lod.levels[0];
    expect(level0.assignments[0]).toBe(level0.assignments[1]);
    expect(level0.assignments[2]).toBe(level0.assignments[3]);
    expect(level0.assignments[0]).not.toBe(level0.assignments[2]);
  });

  it('coarse level has fewer clusters', () => {
    const lod = new ClusterLOD();
    lod.build(positions, 5, 1.0);

    const last = lod.levels[lod.levels.length - 1];
    expect(last.clusterCount).toBeLessThanOrEqual(lod.levels[0].clusterCount);
  });

  it('pickLevel returns -1 when close', () => {
    const lod = new ClusterLOD();
    lod.build(positions, 5, 1.0);
    expect(lod.pickLevel(5, 1.0)).toBe(-1);
  });

  it('pickLevel returns a valid level when far', () => {
    const lod = new ClusterLOD();
    lod.build(positions, 5, 1.0);
    const level = lod.pickLevel(100, 1.0);
    expect(level).toBeGreaterThanOrEqual(0);
    expect(level).toBeLessThan(lod.levels.length);
  });

  it('apply returns cluster data and hides original nodes', () => {
    const lod = new ClusterLOD();
    lod.build(positions, 5, 1.0);

    const colors = new Uint8Array(5 * 4);
    colors.fill(200);
    const vis = new Uint8Array(5);
    vis.fill(1);

    const result = lod.apply(0, colors, 5, vis);
    expect(result).not.toBeNull();
    expect(result!.positions.length).toBe(lod.levels[0].clusterCount * 3);
    expect(result!.sizes.length).toBe(lod.levels[0].clusterCount);

    let visSum = 0;
    for (let i = 0; i < 5; i++) visSum += vis[i];
    expect(visSum).toBe(0);
  });
});
