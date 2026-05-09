import { describe, expect, it } from 'vitest';
import { GraphStore } from './GraphStore';

describe('GraphStore (CPU-side)', () => {
  it('starts empty', () => {
    const store = new GraphStore();
    expect(store.nodeCount).toBe(0);
    expect(store.edgeCount).toBe(0);
  });

  it('setNodes allocates buffers and sets counts', () => {
    const store = new GraphStore();
    const positions = new Float32Array([1, 2, 3, 4, 5, 6]);
    store.setNodes(positions);
    expect(store.nodeCount).toBe(2);
    expect(store.positions[0]).toBe(1);
    expect(store.positions[5]).toBe(6);
  });

  it('setNodes applies default colors when none provided', () => {
    const store = new GraphStore();
    store.setNodes(new Float32Array(3 * 5));
    expect(store.nodeCount).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(store.colors[i * 4 + 3]).toBe(255);
    }
  });

  it('setNodes applies provided colors', () => {
    const store = new GraphStore();
    const positions = new Float32Array(3);
    const colors = new Uint8Array([10, 20, 30, 40]);
    store.setNodes(positions, colors);
    expect(store.colors[0]).toBe(10);
    expect(store.colors[1]).toBe(20);
    expect(store.colors[2]).toBe(30);
    expect(store.colors[3]).toBe(40);
  });

  it('setNodes applies provided sizes', () => {
    const store = new GraphStore();
    const positions = new Float32Array(6);
    const sizes = new Float32Array([2.5, 3.5]);
    store.setNodes(positions, undefined, sizes);
    expect(store.sizes[0]).toBe(2.5);
    expect(store.sizes[1]).toBe(3.5);
  });

  it('updateSizes replaces radii on CPU buffer', () => {
    const store = new GraphStore();
    store.setNodes(new Float32Array(9));
    store.updateSizes(new Float32Array([1.25, 2.25, 3.25]));
    expect(store.sizes[0]).toBe(1.25);
    expect(store.sizes[1]).toBe(2.25);
    expect(store.sizes[2]).toBe(3.25);
  });

  it('setEdges stores indices and default colors', () => {
    const store = new GraphStore();
    const indices = new Uint32Array([0, 1, 1, 2, 2, 0]);
    store.setEdges(indices);
    expect(store.edgeCount).toBe(3);
    expect(store.edgeIndices[0]).toBe(0);
    expect(store.edgeIndices[1]).toBe(1);
    for (let i = 0; i < 3; i++) {
      expect(store.edgeColors[i * 4 + 3]).toBeGreaterThan(0);
    }
  });

  it('visibility defaults to 1 (visible)', () => {
    const store = new GraphStore();
    store.setNodes(new Float32Array(9));
    store.setEdges(new Uint32Array([0, 1]));
    for (let i = 0; i < 3; i++) {
      expect(store.nodeVisibility[i]).toBe(1);
    }
    expect(store.edgeVisibility[0]).toBe(1);
  });

  it('updatePositions partially updates positions', () => {
    const store = new GraphStore();
    store.setNodes(new Float32Array(9));
    store.updatePositions(new Float32Array([7, 8, 9]), { start: 1, count: 1 });
    expect(store.positions[3]).toBe(7);
    expect(store.positions[4]).toBe(8);
    expect(store.positions[5]).toBe(9);
    expect(store.positions[0]).toBe(0);
  });

  it('capacity grows without losing data', () => {
    const store = new GraphStore();
    store.setNodes(new Float32Array(3 * 100));
    expect(store.nodeCount).toBe(100);
    const big = new Float32Array(3 * 5000);
    big[0] = 42;
    store.setNodes(big);
    expect(store.nodeCount).toBe(5000);
    expect(store.positions[0]).toBe(42);
  });

  it('dispose resets counts', () => {
    const store = new GraphStore();
    store.setNodes(new Float32Array(9));
    store.setEdges(new Uint32Array([0, 1]));
    store.dispose();
    expect(store.nodeCount).toBe(0);
    expect(store.edgeCount).toBe(0);
  });

  it('setNodeVisibility updates mask', () => {
    const store = new GraphStore();
    store.setNodes(new Float32Array(9));
    const mask = new Uint8Array([1, 0, 1]);
    store.setNodeVisibility(mask);
    expect(store.nodeVisibility[0]).toBe(1);
    expect(store.nodeVisibility[1]).toBe(0);
    expect(store.nodeVisibility[2]).toBe(1);
  });

  it('setEdgeVisibility updates mask', () => {
    const store = new GraphStore();
    store.setEdges(new Uint32Array([0, 1, 1, 2]));
    const mask = new Uint8Array([0, 1]);
    store.setEdgeVisibility(mask);
    expect(store.edgeVisibility[0]).toBe(0);
    expect(store.edgeVisibility[1]).toBe(1);
  });
});
