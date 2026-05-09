import { describe, expect, it } from 'vitest';

import { createForceConfigPreset } from './forceLayoutPresets';

describe('createForceConfigPreset', () => {
  it('interoperability bundle matches roadmap knobs', () => {
    expect(createForceConfigPreset('interoperability')).toEqual({
      forceScaleMode: 'none',
      linkAttractionMode: 'd3_like',
      integrationMode: 'standard',
      recenterOnFinish: false,
      edgeWeightInfluence: 'off',
      clampVelocity: true,
      extentBudgetFactor: 0,
    });
  });

  it('stability bundle matches roadmap knobs', () => {
    expect(createForceConfigPreset('stability')).toEqual({
      forceScaleMode: 'auto',
      linkAttractionMode: 'kortex_custom',
      integrationMode: 'legacy',
      recenterOnFinish: false,
      edgeWeightInfluence: 'off',
      clampVelocity: true,
      extentBudgetFactor: 0,
    });
  });
});
