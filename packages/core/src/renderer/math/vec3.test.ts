import { describe, expect, it } from 'vitest';
import * as vec3 from './vec3';

describe('vec3', () => {
  it('create returns zero vector', () => {
    const v = vec3.create();
    expect(v).toBeInstanceOf(Float32Array);
    expect(v.length).toBe(3);
    expect(v[0]).toBe(0);
    expect(v[1]).toBe(0);
    expect(v[2]).toBe(0);
  });

  it('fromValues sets components', () => {
    const v = vec3.fromValues(1, 2, 3);
    expect(v[0]).toBe(1);
    expect(v[1]).toBe(2);
    expect(v[2]).toBe(3);
  });

  it('add sums two vectors', () => {
    const a = vec3.fromValues(1, 2, 3);
    const b = vec3.fromValues(4, 5, 6);
    const out = vec3.create();
    vec3.add(out, a, b);
    expect(out[0]).toBe(5);
    expect(out[1]).toBe(7);
    expect(out[2]).toBe(9);
  });

  it('dot computes inner product', () => {
    const a = vec3.fromValues(1, 0, 0);
    const b = vec3.fromValues(0, 1, 0);
    expect(vec3.dot(a, b)).toBe(0);
    expect(vec3.dot(a, a)).toBe(1);
  });

  it('cross of x and y is z', () => {
    const x = vec3.fromValues(1, 0, 0);
    const y = vec3.fromValues(0, 1, 0);
    const out = vec3.create();
    vec3.cross(out, x, y);
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(0);
    expect(out[2]).toBeCloseTo(1);
  });

  it('normalize produces unit length', () => {
    const v = vec3.fromValues(3, 4, 0);
    const out = vec3.create();
    vec3.normalize(out, v);
    expect(vec3.length(out)).toBeCloseTo(1, 6);
  });

  it('scale multiplies by scalar', () => {
    const v = vec3.fromValues(1, 2, 3);
    const out = vec3.create();
    vec3.scale(out, v, 2);
    expect(out[0]).toBe(2);
    expect(out[1]).toBe(4);
    expect(out[2]).toBe(6);
  });
});
