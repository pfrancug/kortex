export interface LODSettings {
  /** Max edges rendered before hiding all. 0 = unlimited. */
  edgeBudget: number;

  /**
   * Max distance from the camera at which edges are visible.
   * Edges beyond this distance are fully hidden.
   * 0 = no distance limit (all edges visible).
   */
  edgeMaxDistance: number;

  /**
   * When edge count exceeds sampleBudget, render only a stable
   * random subset of this size. 0 = no sampling.
   */
  edgeSampleBudget: number;

  /** Seed for deterministic edge sampling (stable across frames). */
  edgeSampleSeed: number;

  /**
   * Max edge chunks rendered per frame during progressive load.
   * Increases each frame until all chunks are drawn. 0 = disabled.
   */
  progressiveChunksPerFrame: number;
}

const DEFAULT_SETTINGS: LODSettings = {
  edgeBudget: 0,
  edgeMaxDistance: 0,
  edgeSampleBudget: 0,
  edgeSampleSeed: 42,
  progressiveChunksPerFrame: 4,
};

/**
 * Centralised LOD controller that manages edge budgets, fading,
 * sampling, and progressive rendering decisions.
 */
export class LODController {
  readonly settings: LODSettings;

  /** How many edge chunks we're allowed to draw this frame (progressive). */
  private progressiveMaxChunks = 0;
  private progressiveComplete = false;

  constructor(settings?: Partial<LODSettings>) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
  }

  /** Merge LOD knobs: **`DEFAULT_SETTINGS`** ∪ **`patch`** (omitted keys reset to defaults). Skip if **`patch`** is `undefined`. */
  applySettings(patch?: Partial<LODSettings>): void {
    if (patch === undefined) return;
    const next = { ...DEFAULT_SETTINGS, ...patch };
    Object.assign(this.settings, next);
  }

  /**
   * Call once per frame. Returns the effective number of edges to render.
   */
  getEffectiveEdgeCount(totalEdges: number): number {
    const s = this.settings;

    if (s.edgeBudget > 0 && totalEdges > s.edgeBudget) {
      return 0;
    }

    if (s.edgeSampleBudget > 0 && totalEdges > s.edgeSampleBudget) {
      return s.edgeSampleBudget;
    }

    return totalEdges;
  }

  /**
   * Returns the maximum number of edge chunks to draw this frame
   * for progressive rendering. Call advanceProgressive() after drawing.
   */
  getProgressiveChunkLimit(): number {
    if (
      this.settings.progressiveChunksPerFrame <= 0 ||
      this.progressiveComplete
    ) {
      return Infinity;
    }
    return this.progressiveMaxChunks;
  }

  advanceProgressive(totalChunks: number): void {
    if (this.progressiveComplete) return;
    this.progressiveMaxChunks += this.settings.progressiveChunksPerFrame;
    if (this.progressiveMaxChunks >= totalChunks) {
      this.progressiveComplete = true;
    }
  }

  resetProgressive(): void {
    this.progressiveMaxChunks = 0;
    this.progressiveComplete = false;
  }

  /**
   * Build an edge visibility mask using deterministic sampling.
   * Returns a Uint8Array where 1 = visible, 0 = hidden.
   */
  buildEdgeSampleMask(
    totalEdges: number,
    budget: number,
    seed: number,
    out?: Uint8Array,
  ): Uint8Array {
    const mask =
      out && out.length >= totalEdges ? out : new Uint8Array(totalEdges);

    if (budget <= 0 || budget >= totalEdges) {
      mask.fill(1, 0, totalEdges);
      return mask;
    }

    mask.fill(0, 0, totalEdges);

    // Fisher-Yates partial shuffle using seeded LCG
    const indices = new Uint32Array(totalEdges);
    for (let i = 0; i < totalEdges; i++) indices[i] = i;

    let state = seed | 0 || 1;
    for (let i = 0; i < budget; i++) {
      state = lcgNext(state);
      const j = i + (((state >>> 0) % (totalEdges - i)) | 0);
      const tmp = indices[i];
      indices[i] = indices[j];
      indices[j] = tmp;
      mask[indices[i]] = 1;
    }

    return mask;
  }
}

/** Simple LCG PRNG — fast, deterministic, good enough for sampling. */
function lcgNext(state: number): number {
  return Math.imul(state, 1664525) + 1013904223;
}
