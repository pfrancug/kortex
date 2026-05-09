import { describe, expect, it } from 'vitest';
import * as mat4 from './mat4';

describe('mat4', () => {
  it('create returns identity', () => {
    const m = mat4.create();
    expect(m).toBeInstanceOf(Float32Array);
    expect(m.length).toBe(16);
    expect(m[0]).toBe(1);
    expect(m[5]).toBe(1);
    expect(m[10]).toBe(1);
    expect(m[15]).toBe(1);
    expect(m[1]).toBe(0);
  });

  it('identity resets to identity', () => {
    const m = mat4.create();
    m[3] = 99;
    mat4.identity(m);
    expect(m[3]).toBe(0);
    expect(m[0]).toBe(1);
  });

  it('perspective produces finite non-zero values', () => {
    const out = mat4.create();
    mat4.perspective(out, Math.PI / 4, 16 / 9, 0.1, 1000);
    for (let i = 0; i < 16; i++) {
      expect(Number.isFinite(out[i])).toBe(true);
    }
    expect(out[0]).not.toBe(0);
    expect(out[5]).not.toBe(0);
    expect(out[11]).toBe(-1);
  });

  it('multiply identity * A = A', () => {
    const a = mat4.create();
    mat4.perspective(a, Math.PI / 3, 1, 0.1, 100);
    const id = mat4.create();
    const out = mat4.create();
    mat4.multiply(out, id, a);
    for (let i = 0; i < 16; i++) {
      expect(out[i]).toBeCloseTo(a[i], 10);
    }
  });

  it('lookAt produces a valid view matrix', () => {
    const eye = new Float32Array([0, 0, 5]);
    const center = new Float32Array([0, 0, 0]);
    const up = new Float32Array([0, 1, 0]);
    const out = mat4.create();
    mat4.lookAt(out, eye, center, up);
    expect(out[14]).toBeCloseTo(-5, 5);
  });
});
