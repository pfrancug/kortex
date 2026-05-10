import type { ForceConfig, ForceStartMsg, ForceResponse } from './ForceWorker';
import { FORCE_LAYOUT_DEFAULTS } from './ForceWorker';

export type { ForceConfig } from './ForceWorker';

function clampEdgeLengthMultiplier(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 1;
  return Math.min(x, 1e6);
}

/**
 * Force-directed graph layout engine.
 *
 * Runs a Barnes-Hut n-body simulation in a Web Worker. The main thread
 * receives position updates each tick and can feed them into the renderer
 * via `graph.updatePositions()`.
 *
 * @example
 * ```ts
 * const layout = new ForceLayout();
 * layout.onTick = (positions) => {
 *   renderer.graph.updatePositions(positions);
 * };
 * layout.start(graph.positions, graph.edgeIndices, graph.nodeCount, graph.edgeCount);
 * ```
 */
export class ForceLayout {
  private worker: Worker | null = null;

  /**
   * Scales {@link ForceConfig.linkDistance} (target edge length in layout space).
   * Applied when calling {@link ForceLayout.start} and when passing `linkDistance` via {@link ForceLayout.configure}.
   */
  edgeLengthMultiplier = 1;

  /** Called every simulation tick with updated positions. */
  onTick:
    | ((positions: Float32Array, energy: number, iteration: number) => void)
    | null = null;

  /** Called when the simulation has converged and stopped. */
  onStabilized: ((positions: Float32Array, iteration: number) => void) | null =
    null;

  /** Whether the simulation is currently running. */
  running = false;

  /**
   * Start the force simulation.
   * Positions are copied — the input array is not modified.
   *
   * Merges **`FORCE_LAYOUT_DEFAULTS`** with `config`. Extended physics modes (`forceScaleMode`,
   * `linkAttractionMode`, …) are documented on {@link ForceConfig}; use
   * {@link createForceConfigPreset} for named bundles.
   *
   * `edgeWeights` is forwarded when length ≥ `edgeCount` and combined with
   * {@link ForceConfig.edgeWeightInfluence} in the worker (`edgeWeightFactors.ts`).
   */
  start(
    positions: Float32Array,
    edgeIndices: Uint32Array,
    nodeCount: number,
    edgeCount: number,
    config: Partial<ForceConfig> = {},
    edgeWeights?: Float32Array | null,
  ): void {
    this.stop();

    this.worker = new Worker(new URL('./ForceWorker.js', import.meta.url), {
      type: 'module',
    });

    this.worker.onmessage = (e: MessageEvent<ForceResponse>) => {
      const msg = e.data;
      if (msg.type === 'tick') {
        this.onTick?.(msg.positions, msg.energy, msg.iteration);
      } else if (msg.type === 'stabilized') {
        this.running = false;
        this.onStabilized?.(msg.positions, msg.iteration);
      }
    };

    this.worker.onerror = () => {
      this.running = false;
    };

    const positionsCopy = new Float32Array(positions);
    const edgesCopy = new Uint32Array(edgeIndices);

    const merged: ForceConfig = {
      ...FORCE_LAYOUT_DEFAULTS,
      ...config,
    };
    merged.linkDistance *= clampEdgeLengthMultiplier(this.edgeLengthMultiplier);

    const msg: ForceStartMsg = {
      type: 'start',
      positions: positionsCopy,
      edgeIndices: edgesCopy,
      nodeCount,
      edgeCount,
      config: merged,
    };

    const xfer: ArrayBuffer[] = [positionsCopy.buffer, edgesCopy.buffer];
    if (edgeWeights && edgeWeights.length >= edgeCount) {
      const wCopy = new Float32Array(edgeWeights.subarray(0, edgeCount));
      msg.edgeWeights = wCopy;
      xfer.push(wCopy.buffer);
    }

    this.running = true;
    this.worker.postMessage(msg, xfer);
  }

  /** Update simulation parameters while running. */
  configure(config: Partial<ForceConfig>): void {
    if (!this.worker) return;
    const patch: Partial<ForceConfig> = { ...config };
    if (patch.linkDistance !== undefined) {
      patch.linkDistance *= clampEdgeLengthMultiplier(
        this.edgeLengthMultiplier,
      );
    }
    this.worker.postMessage({ type: 'config', config: patch });
  }

  /** Stop the simulation. */
  stop(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'stop' });
      this.worker.terminate();
      this.worker = null;
    }
    this.running = false;
  }

  /** Clean up resources. */
  dispose(): void {
    this.stop();
    this.onTick = null;
    this.onStabilized = null;
  }
}
