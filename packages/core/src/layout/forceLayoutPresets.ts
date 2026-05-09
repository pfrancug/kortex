import type { ForceConfig } from './ForceWorker';

/** Named bundles for {@link createForceConfigPreset}. */
export type ForceLayoutPresetId = 'interoperability' | 'stability';

/**
 * Returns a partial {@link ForceConfig} to spread into `ForceLayout.start(..., config)` or
 * merge with {@link FORCE_LAYOUT_DEFAULTS}.
 *
 * - **`interoperability`** — `forceScaleMode: 'none'`, **`d3_like`** links, **`standard`** tick order
 *   (link → charge → center), no finish recenter.
 * - **`stability`** — `forceScaleMode: 'auto'`, **`kortex_custom`** links, **`legacy`** tick order
 *   (charge → link → center), matching pre–Phase B dense-graph tuning.
 */
export function createForceConfigPreset(
  id: ForceLayoutPresetId,
): Partial<ForceConfig> {
  switch (id) {
    case 'interoperability':
      return {
        forceScaleMode: 'none',
        linkAttractionMode: 'd3_like',
        integrationMode: 'standard',
        recenterOnFinish: false,
        edgeWeightInfluence: 'off',
        clampVelocity: true,
        extentBudgetFactor: 0,
      };
    case 'stability':
      return {
        forceScaleMode: 'auto',
        linkAttractionMode: 'kortex_custom',
        integrationMode: 'legacy',
        recenterOnFinish: false,
        edgeWeightInfluence: 'off',
        clampVelocity: true,
        extentBudgetFactor: 0,
      };
  }
}
