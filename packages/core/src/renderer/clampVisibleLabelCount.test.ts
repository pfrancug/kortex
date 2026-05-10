import { describe, expect, it } from 'vitest';
import {
  MAX_VISIBLE_LABELS_UNLIMITED,
  clampVisibleLabelCount,
} from './Renderer';
import { LABEL_MAX_NODES_PER_BUILD } from './LabelRenderer';

describe('clampVisibleLabelCount', () => {
  it('maps unlimited sentinel to label GPU node cap', () => {
    expect(clampVisibleLabelCount(MAX_VISIBLE_LABELS_UNLIMITED)).toBe(
      LABEL_MAX_NODES_PER_BUILD,
    );
  });

  it('maps Infinity to label GPU node cap', () => {
    expect(clampVisibleLabelCount(Number.POSITIVE_INFINITY)).toBe(
      LABEL_MAX_NODES_PER_BUILD,
    );
  });

  it('returns 0 for non-positive finite values', () => {
    expect(clampVisibleLabelCount(0)).toBe(0);
    expect(clampVisibleLabelCount(-2)).toBe(0);
  });

  it('floors and caps finite positives', () => {
    expect(clampVisibleLabelCount(9.7)).toBe(9);
    expect(clampVisibleLabelCount(1e12)).toBe(LABEL_MAX_NODES_PER_BUILD);
  });
});
