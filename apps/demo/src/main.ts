import {
  Renderer,
  parseGraphAsync,
  ForceLayout,
  applyDegreeWeightFilters,
  FORCE_LAYOUT_DEFAULTS,
  createForceConfigPreset,
  clampPresentationScale,
  suggestedNodeSizeMultiplierFromLayout,
  type EdgeWeightInfluence,
  type ForceConfig,
  type ForceLayoutPresetId,
  type ForceScaleMode,
  type IntegrationMode,
  type LinkAttractionMode,
} from '@nexgraph/core';
import { AxesGrid } from './demo/AxesGrid';
import { generateGraphAsync } from './demo/generateGraph';
import {
  buildPositionedGraphJson,
  triggerGraphJsonDownload,
} from './demo/exportGraphJson';
import {
  SettingsPanel,
  type DatasetPreset,
  type NodeSizeMode,
} from './demo/SettingsPanel';

// ── Bootstrap ───────────────────────────────────────────────────────

const root = document.getElementById('app');
if (!root) throw new Error('#app element not found');

const renderer = new Renderer({
  parent: root,
  nodeSizeMultiplier: 1,
  edgeOpacity: 0.25,
});

/** Last auto-derived multiplier from bbox + density (before UI bias). */
let cachedAutoNodeMultiplier = 1;
/** “Node size × fit” slider — multiplied into {@link cachedAutoNodeMultiplier}. */
let nodeSizeUserBias = 1;

function applyRendererNodeSizeFromAuto(): void {
  renderer.nodeSizeMultiplier = clampPresentationScale(
    cachedAutoNodeMultiplier * nodeSizeUserBias,
  );
}

function refreshAutoNodeScale(): void {
  const n = renderer.graph.nodeCount;
  if (n <= 0) return;
  cachedAutoNodeMultiplier = suggestedNodeSizeMultiplierFromLayout(
    renderer.graph.positions,
    n,
    renderer.graph.sizes.subarray(0, n),
  );
  applyRendererNodeSizeFromAuto();
}

/** xyz snapshot taken after each successful load (before optional auto-layout). {@link resetDatasetPositions} restores it. */
let datasetInitialPositions: Float32Array | null = null;

function captureDatasetInitialPositions(): void {
  const nc = renderer.graph.nodeCount;
  if (nc <= 0) {
    datasetInitialPositions = null;
    return;
  }
  datasetInitialPositions = new Float32Array(
    renderer.graph.positions.subarray(0, nc * 3),
  );
}

/** Restores xyz + sizing framing when snapshot matches current node count; false if none/mismatch. */
function applyDatasetPositionsSnapshotIfCompatible(): boolean {
  const nc = renderer.graph.nodeCount;
  const snap = datasetInitialPositions;
  if (!snap || snap.length !== nc * 3 || nc === 0) return false;
  renderer.graph.updatePositions(new Float32Array(snap));
  refreshAutoNodeScale();
  return true;
}

function resetDatasetPositions(): void {
  forceLayout.stop();
  cancelScheduledLayoutRestart();
  if (!applyDatasetPositionsSnapshotIfCompatible()) {
    panel.setStatus('No saved load positions — load a graph with nodes first.');
    return;
  }
  invalidateLayoutConvergenceState();
  panel.setStatus('Restored positions from last load.');
}

/** Per-edge weights when the file has real strengths; null ⇒ skip weight gate (uniform edges behave like unweighted filters). */
let importedEdgeWeights: Float32Array | null = null;

/** Keep weights only when any edge differs from the parser default (1); otherwise filters behave like presets. */
function normalizeImportedEdgeWeightsForFilters(
  w: Float32Array | undefined,
  edgeCount: number,
): Float32Array | null {
  if (!w || edgeCount <= 0 || w.length < edgeCount) return null;
  for (let i = 0; i < edgeCount; i++) {
    const x = w[i];
    if (!Number.isFinite(x)) return null;
    if (Math.abs(x - 1) > 1e-5) {
      return new Float32Array(w.subarray(0, edgeCount));
    }
  }
  return null;
}

let filterMinDegree = 1;
let filterMinWeight = 1;

/** Radii last loaded from file/generator (restored when Size nodes by = File). */
let loadedSizesScratch = new Float32Array(0);
let derivedSizesScratch = new Float32Array(0);
let nodeSizeMode: NodeSizeMode = 'file';

function ensureLoadedScratch(n: number): void {
  if (loadedSizesScratch.length < n) loadedSizesScratch = new Float32Array(n);
}

function ensureDerivedScratch(n: number): void {
  if (derivedSizesScratch.length < n) derivedSizesScratch = new Float32Array(n);
}

function snapshotLoadedSizesFromGraph(): void {
  const n = renderer.graph.nodeCount;
  if (n === 0) return;
  ensureLoadedScratch(n);
  loadedSizesScratch.set(renderer.graph.sizes.subarray(0, n));
}

function fillDerivedSizes(mode: 'degree' | 'incident_weight'): void {
  const nc = renderer.graph.nodeCount;
  const ec = renderer.graph.edgeCount;
  if (nc === 0) return;
  ensureDerivedScratch(nc);
  const ei = renderer.graph.edgeIndices;
  const ev = renderer.graph.edgeVisibility;
  const deg = new Float32Array(nc);
  const wsum = new Float32Array(nc);
  const wSrc = importedEdgeWeights;
  for (let i = 0; i < ec; i++) {
    if (!ev[i]) continue;
    const a = ei[i * 2];
    const b = ei[i * 2 + 1];
    let w = wSrc !== null && i < wSrc.length ? wSrc[i] : 1;
    if (!Number.isFinite(w) || w <= 0) w = 1;
    deg[a]++;
    deg[b]++;
    wsum[a] += w;
    wsum[b] += w;
  }
  const metric = mode === 'degree' ? deg : wsum;
  const out = derivedSizesScratch;
  // Demo sphere heuristic when deriving radii from degree / Σ weight: 4 × ∛max(1, metric/10).
  const NODE_REL_SIZE = 4;
  const METRIC_SCALE = 10;
  for (let i = 0; i < nc; i++) {
    const m = metric[i];
    const v = Math.max(1, m / METRIC_SCALE);
    out[i] = NODE_REL_SIZE * Math.cbrt(v);
  }
}

function refreshNodePresentationSizes(): void {
  const n = renderer.graph.nodeCount;
  if (n === 0) return;
  if (nodeSizeMode === 'file') {
    ensureLoadedScratch(n);
    renderer.graph.updateSizes(loadedSizesScratch.subarray(0, n));
  } else {
    fillDerivedSizes(nodeSizeMode);
    renderer.graph.updateSizes(derivedSizesScratch.subarray(0, n));
  }
  refreshAutoNodeScale();
}

function applyGraphFilterMasks(): void {
  applyDegreeWeightFilters(
    renderer.graph,
    importedEdgeWeights,
    filterMinDegree,
    filterMinWeight,
  );
  refreshNodePresentationSizes();
}

const axes = new AxesGrid(renderer.gl);
const forceLayout = new ForceLayout();
/** Physics worker ticks are sparse vs render FPS — blend toward latest worker snapshot for large graphs. */
function shouldSmoothLayoutMotion(): boolean {
  const g = renderer.graph;
  return g.nodeCount >= 12_000 || g.edgeCount >= 35_000;
}
let layoutSmoothTo: Float32Array | null = null;
let layoutPrevWorkerTarget: Float32Array | null = null;
let layoutSmoothScratch: Float32Array | null = null;
/** EWMA of seconds between worker layout ticks — drives smoothing time constant. */
let layoutWorkerDtEwma = 0.35;
let layoutLastWorkerWallMs = 0;
let layoutLastWorkerIteration = 0;

function resetHeavyLayoutSmoothing(): void {
  layoutSmoothTo = layoutPrevWorkerTarget = layoutSmoothScratch = null;
  layoutWorkerDtEwma = 0.35;
  layoutLastWorkerWallMs = 0;
  layoutLastWorkerIteration = 0;
}

function ensureLayoutSmoothBuffers(nodeCount: number): void {
  const n = nodeCount * 3;
  if (!layoutSmoothScratch || layoutSmoothScratch.length !== n) {
    layoutSmoothTo = new Float32Array(n);
    layoutPrevWorkerTarget = new Float32Array(n);
    layoutSmoothScratch = new Float32Array(n);
  }
}
/** `forceCenter`-style pull toward origin (d3 default 1). */
let layoutCenterStrength = 1;

let layoutPresetId: ForceLayoutPresetId = 'interoperability';

let advancedTheta = FORCE_LAYOUT_DEFAULTS.theta;
let advancedDistanceMin = FORCE_LAYOUT_DEFAULTS.distanceMin;
let advancedForceScaleMode: ForceScaleMode =
  FORCE_LAYOUT_DEFAULTS.forceScaleMode;
let advancedEdgeWeightInfluence: EdgeWeightInfluence =
  FORCE_LAYOUT_DEFAULTS.edgeWeightInfluence;
let advancedLinkAttractionMode: LinkAttractionMode =
  FORCE_LAYOUT_DEFAULTS.linkAttractionMode;
let advancedIntegrationMode: IntegrationMode =
  FORCE_LAYOUT_DEFAULTS.integrationMode;
let advancedClampVelocity = FORCE_LAYOUT_DEFAULTS.clampVelocity;
let advancedRecenterOnFinish = FORCE_LAYOUT_DEFAULTS.recenterOnFinish;

function layoutPhysicsConfig(): Partial<ForceConfig> {
  return {
    ...createForceConfigPreset(layoutPresetId),
    theta: advancedTheta,
    distanceMin: advancedDistanceMin,
    forceScaleMode: advancedForceScaleMode,
    edgeWeightInfluence: advancedEdgeWeightInfluence,
    linkAttractionMode: advancedLinkAttractionMode,
    integrationMode: advancedIntegrationMode,
    clampVelocity: advancedClampVelocity,
    recenterOnFinish: advancedRecenterOnFinish,
    centerStrength: layoutCenterStrength,
  };
}

/** Matches {@link ForceLayout} edge-length multiplier clamp. */
function clampEdgeLenMul(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 1;
  return Math.min(x, 1e6);
}

const LAYOUT_RESTART_DEBOUNCE_MS = 380;

let layoutRestartTimer: ReturnType<typeof setTimeout> | null = null;
/** Physics + topology signature after last clean convergence; cleared when graph or run changes. */
let lastConvergedPhysicsFingerprint = '';

function stablePhysicsFingerprint(): string {
  const ec = renderer.graph.edgeCount;
  const weightsLen =
    importedEdgeWeights !== null && importedEdgeWeights.length >= ec
      ? importedEdgeWeights.length
      : 0;
  return JSON.stringify({
    preset: layoutPresetId,
    theta: advancedTheta,
    distanceMin: advancedDistanceMin,
    forceScaleMode: advancedForceScaleMode,
    edgeWeightInfluence: advancedEdgeWeightInfluence,
    linkAttractionMode: advancedLinkAttractionMode,
    integrationMode: advancedIntegrationMode,
    clampVelocity: advancedClampVelocity,
    recenterOnFinish: advancedRecenterOnFinish,
    centerStrength: layoutCenterStrength,
    edgeLenMul: clampEdgeLenMul(forceLayout.edgeLengthMultiplier),
    baseLinkDistance: FORCE_LAYOUT_DEFAULTS.linkDistance,
    edgeWeightsLen: weightsLen,
    nodeCount: renderer.graph.nodeCount,
    edgeCount: ec,
  });
}

function invalidateLayoutConvergenceState(): void {
  lastConvergedPhysicsFingerprint = '';
}

function cancelScheduledLayoutRestart(): void {
  if (layoutRestartTimer !== null) {
    clearTimeout(layoutRestartTimer);
    layoutRestartTimer = null;
  }
}

/** Interrupt force layout + physics debounce before graph replacement so the new dataset isn’t overwritten by the old worker. */
function stopLayoutForNewDataset(): void {
  forceLayout.stop();
  cancelScheduledLayoutRestart();
  resetHeavyLayoutSmoothing();
}

function scheduleLayoutRestart(
  statusMsg: string,
  seedFromDataset = true,
): void {
  if (renderer.graph.nodeCount === 0 || renderer.graph.edgeCount === 0) return;
  cancelScheduledLayoutRestart();
  layoutRestartTimer = setTimeout(() => {
    layoutRestartTimer = null;
    beginForceLayoutRun(statusMsg, seedFromDataset);
  }, LAYOUT_RESTART_DEBOUNCE_MS);
}

function beginForceLayoutRun(statusMsg: string, seedFromDataset = false): void {
  if (renderer.graph.nodeCount === 0 || renderer.graph.edgeCount === 0) return;
  cancelScheduledLayoutRestart();
  invalidateLayoutConvergenceState();
  resetHeavyLayoutSmoothing();
  if (seedFromDataset) {
    applyDatasetPositionsSnapshotIfCompatible();
  }
  forceLayout.start(
    renderer.graph.positions,
    renderer.graph.edgeIndices,
    renderer.graph.nodeCount,
    renderer.graph.edgeCount,
    layoutPhysicsConfig(),
    importedEdgeWeights ?? undefined,
  );
  panel.setStatus(statusMsg);
}

function pushRunningLayoutPhysics(): void {
  if (!forceLayout.running) return;
  forceLayout.configure(layoutPhysicsConfig());
}

function applyPhysicsChangeWhileIdle(): void {
  if (forceLayout.running) {
    pushRunningLayoutPhysics();
    invalidateLayoutConvergenceState();
  } else {
    scheduleLayoutRestart(
      'Applying physics — re-running layout from load seed…',
    );
  }
}

let panel!: SettingsPanel;

function applyPresetToUi(id: ForceLayoutPresetId): void {
  layoutPresetId = id;
  const pr = createForceConfigPreset(id);
  advancedTheta = FORCE_LAYOUT_DEFAULTS.theta;
  advancedDistanceMin = FORCE_LAYOUT_DEFAULTS.distanceMin;
  advancedForceScaleMode =
    pr.forceScaleMode ?? FORCE_LAYOUT_DEFAULTS.forceScaleMode;
  advancedEdgeWeightInfluence =
    pr.edgeWeightInfluence ?? FORCE_LAYOUT_DEFAULTS.edgeWeightInfluence;
  advancedLinkAttractionMode =
    pr.linkAttractionMode ?? FORCE_LAYOUT_DEFAULTS.linkAttractionMode;
  advancedIntegrationMode =
    pr.integrationMode ?? FORCE_LAYOUT_DEFAULTS.integrationMode;
  advancedClampVelocity =
    pr.clampVelocity ?? FORCE_LAYOUT_DEFAULTS.clampVelocity;
  advancedRecenterOnFinish =
    pr.recenterOnFinish ?? FORCE_LAYOUT_DEFAULTS.recenterOnFinish;
  panel.syncForcePhysicsControls({
    presetId: id,
    theta: advancedTheta,
    distanceMin: advancedDistanceMin,
    forceScaleMode: advancedForceScaleMode,
    edgeWeightInfluence: advancedEdgeWeightInfluence,
    linkAttractionMode: advancedLinkAttractionMode,
    integrationMode: advancedIntegrationMode,
    clampVelocity: advancedClampVelocity,
    recenterOnFinish: advancedRecenterOnFinish,
  });
}

let axesVisible = true;

forceLayout.onTick = (positions, _energy, iteration) => {
  const nc = renderer.graph.nodeCount;
  if (shouldSmoothLayoutMotion() && nc > 0) {
    const now = performance.now();
    if (layoutLastWorkerWallMs > 0) {
      const dtW = (now - layoutLastWorkerWallMs) / 1000;
      layoutWorkerDtEwma = layoutWorkerDtEwma * 0.82 + dtW * 0.18;
    }
    layoutLastWorkerWallMs = now;
    layoutLastWorkerIteration = iteration;
    ensureLayoutSmoothBuffers(nc);
    if (layoutSmoothTo && layoutPrevWorkerTarget) {
      layoutPrevWorkerTarget.set(layoutSmoothTo);
    }
    layoutSmoothTo!.set(positions.subarray(0, nc * 3));
    return;
  }
  renderer.graph.updatePositions(positions);
};

forceLayout.onStabilized = (positions, iteration) => {
  resetHeavyLayoutSmoothing();
  renderer.graph.updatePositions(positions);
  refreshAutoNodeScale();
  lastConvergedPhysicsFingerprint = stablePhysicsFingerprint();
  panel.setStatus(
    `Layout converged (${iteration} iterations). Physics tweaks re-run automatically when idle.`,
  );
};

// ── Presets ──────────────────────────────────────────────────────────

const PRESETS: DatasetPreset[] = [
  { label: '500', nodeCount: 100, edgesPerNode: 2 },
  { label: '100K', nodeCount: 20_000, edgesPerNode: 5 },
  { label: '1M', nodeCount: 100_000, edgesPerNode: 5 },
  { label: '5M', nodeCount: 250_000, edgesPerNode: 10 },
  { label: '15M', nodeCount: 500_000, edgesPerNode: 15 },
];

async function loadPreset(preset: DatasetPreset): Promise<void> {
  panel.showLoader(`Generating ${preset.label} edges...`);
  renderer.lod.resetProgressive();
  stopLayoutForNewDataset();

  try {
    const graph = await generateGraphAsync(
      preset.nodeCount,
      8,
      preset.edgesPerNode,
    );

    renderer.graph.setNodes(
      graph.positions,
      graph.colors,
      graph.sizes,
      graph.labels,
    );
    renderer.graph.setEdges(graph.edgeIndices);
    renderer.fitToData();

    importedEdgeWeights = null;
    snapshotLoadedSizesFromGraph();
    applyGraphFilterMasks();
    captureDatasetInitialPositions();
    invalidateLayoutConvergenceState();

    const nc = renderer.graph.nodeCount.toLocaleString();
    const ec = renderer.graph.edgeCount.toLocaleString();
    panel.setStatus(
      `${nc} nodes, ${ec} edges (${graph.elapsedMs.toFixed(0)}ms)`,
    );
  } catch (err) {
    panel.setStatus(`Error: ${err instanceof Error ? err.message : err}`);
  } finally {
    panel.hideLoader();
  }
}

async function loadFile(file: File): Promise<void> {
  panel.showLoader(`Parsing ${file.name}...`);
  stopLayoutForNewDataset();
  try {
    const text = await file.text();
    const type = file.name.endsWith('.csv')
      ? ('csv' as const)
      : ('json' as const);
    const result = await parseGraphAsync(type, text);

    if (result.nodeCount > 0) {
      renderer.graph.setNodes(
        result.positions,
        undefined,
        undefined,
        result.labels,
      );
    }
    if (result.edgeCount > 0) {
      renderer.graph.setEdges(result.edgeIndices);
    }
    importedEdgeWeights = normalizeImportedEdgeWeightsForFilters(
      result.edgeWeights,
      result.edgeCount,
    );
    snapshotLoadedSizesFromGraph();
    applyGraphFilterMasks();
    captureDatasetInitialPositions();
    renderer.lod.resetProgressive();
    renderer.fitToData();
    invalidateLayoutConvergenceState();

    const nc = renderer.graph.nodeCount.toLocaleString();
    const ec = renderer.graph.edgeCount.toLocaleString();
    if (
      result.layoutSuggested &&
      result.nodeCount > 0 &&
      result.edgeCount > 0
    ) {
      beginForceLayoutRun(
        `${nc} nodes, ${ec} edges — running force layout on topology seed…`,
        false,
      );
    } else {
      panel.setStatus(`${nc} nodes, ${ec} edges from ${file.name}`);
    }
  } catch (err) {
    panel.setStatus(`Error: ${err instanceof Error ? err.message : err}`);
  } finally {
    panel.hideLoader();
  }
}

async function loadURL(url: string): Promise<void> {
  panel.showLoader(`Fetching ${url}...`);
  stopLayoutForNewDataset();
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    const type = url.endsWith('.csv') ? ('csv' as const) : ('json' as const);
    const result = await parseGraphAsync(type, text);

    if (result.nodeCount > 0) {
      renderer.graph.setNodes(
        result.positions,
        undefined,
        undefined,
        result.labels,
      );
    }
    if (result.edgeCount > 0) {
      renderer.graph.setEdges(result.edgeIndices);
    }
    importedEdgeWeights = normalizeImportedEdgeWeightsForFilters(
      result.edgeWeights,
      result.edgeCount,
    );
    snapshotLoadedSizesFromGraph();
    applyGraphFilterMasks();
    captureDatasetInitialPositions();
    renderer.lod.resetProgressive();
    renderer.fitToData();
    invalidateLayoutConvergenceState();

    const nc = renderer.graph.nodeCount.toLocaleString();
    const ec = renderer.graph.edgeCount.toLocaleString();
    if (
      result.layoutSuggested &&
      result.nodeCount > 0 &&
      result.edgeCount > 0
    ) {
      beginForceLayoutRun(
        `${nc} nodes, ${ec} edges — running force layout on topology seed…`,
        false,
      );
    } else {
      panel.setStatus(`${nc} nodes, ${ec} edges from URL`);
    }
  } catch (err) {
    panel.setStatus(`Error: ${err instanceof Error ? err.message : err}`);
  } finally {
    panel.hideLoader();
  }
}

// ── Settings Panel ──────────────────────────────────────────────────

panel = new SettingsPanel(
  root,
  renderer,
  {
    onLoadPreset: (p) => void loadPreset(p),
    onLoadFile: (f) => void loadFile(f),
    onLoadURL: (u) => void loadURL(u),
    onExportGraphJson: () => {
      const nc = renderer.graph.nodeCount;
      const ec = renderer.graph.edgeCount;
      if (nc === 0) {
        panel.setStatus('Nothing to export (no nodes)');
        return;
      }
      try {
        const json = buildPositionedGraphJson({
          positions: renderer.graph.positions.subarray(0, nc * 3),
          nodeCount: nc,
          edgeIndices: renderer.graph.edgeIndices.subarray(0, ec * 2),
          edgeCount: ec,
          labels: renderer.graph.labels,
          edgeWeights: importedEdgeWeights,
        });
        triggerGraphJsonDownload(json, 'nexgraph-graph');
        panel.setStatus(
          `Exported ${nc.toLocaleString()} nodes, ${ec.toLocaleString()} edges`,
        );
      } catch (err) {
        panel.setStatus(
          `Export failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    onGraphFilterChange: (minD, minW) => {
      filterMinDegree = minD;
      filterMinWeight = minW;
      applyGraphFilterMasks();
    },
    onEdgeBudgetChange: (v) => {
      renderer.lod.settings.edgeBudget = v;
    },
    onEdgeSampleChange: (v) => {
      renderer.lod.settings.edgeSampleBudget = v;
      if (v > 0 && renderer.graph.edgeCount > v) {
        const mask = renderer.lod.buildEdgeSampleMask(
          renderer.graph.edgeCount,
          v,
          renderer.lod.settings.edgeSampleSeed,
        );
        renderer.graph.setEdgeVisibility(mask);
        refreshNodePresentationSizes();
      } else {
        applyGraphFilterMasks();
      }
    },
    onEdgeMaxDistChange: (d) => {
      renderer.lod.settings.edgeMaxDistance = d;
    },
    onProgressiveToggle: (on) => {
      renderer.lod.settings.progressiveChunksPerFrame = on ? 4 : 0;
      if (on) renderer.lod.resetProgressive();
    },
    onForceLayout: () => {
      if (renderer.graph.nodeCount === 0 || renderer.graph.edgeCount === 0) {
        panel.setStatus('Load a graph with edges first.');
        return;
      }
      if (forceLayout.running) {
        panel.setStatus('Layout already running (Stop first to restart).');
        return;
      }
      const fp = stablePhysicsFingerprint();
      if (
        fp === lastConvergedPhysicsFingerprint &&
        lastConvergedPhysicsFingerprint !== ''
      ) {
        panel.setStatus(
          'Already settled with these physics. Change a dial or the graph to re-layout.',
        );
        return;
      }
      beginForceLayoutRun('Running force layout…');
    },
    onStopLayout: () => {
      forceLayout.stop();
      cancelScheduledLayoutRestart();
      invalidateLayoutConvergenceState();
      resetHeavyLayoutSmoothing();
      panel.setStatus('Layout stopped');
    },
    onResetDatasetPositions: () => {
      resetDatasetPositions();
    },
    onLayoutCenterStrengthChange: (v) => {
      layoutCenterStrength = v;
      if (forceLayout.running) {
        forceLayout.configure({ centerStrength: v });
        invalidateLayoutConvergenceState();
      } else {
        scheduleLayoutRestart(
          'Updating layout for center gravity (from load seed)…',
        );
      }
    },
    onLabelsToggle: (visible) => {
      renderer.setLabelsVisible(visible);
    },
    onMaxVisibleLabelsChange: (n) => {
      renderer.maxVisibleLabels = n;
    },
    onEdgesVisibleToggle: (visible) => {
      if (!visible) {
        const mask = new Uint8Array(renderer.graph.edgeCount);
        renderer.graph.setEdgeVisibility(mask);
        refreshNodePresentationSizes();
      } else {
        applyGraphFilterMasks();
      }
    },
    onAxesToggle: (visible) => {
      axesVisible = visible;
    },
    onNodeSizeBiasChange: (bias) => {
      nodeSizeUserBias = bias;
      applyRendererNodeSizeFromAuto();
    },
    onNodeSizeModeChange: (mode) => {
      nodeSizeMode = mode;
      refreshNodePresentationSizes();
    },
    onEdgeLengthMultiplierChange: (mul) => {
      forceLayout.edgeLengthMultiplier = mul;
      if (renderer.graph.nodeCount === 0 || renderer.graph.edgeCount === 0) {
        return;
      }
      if (forceLayout.running) {
        forceLayout.configure({
          linkDistance: FORCE_LAYOUT_DEFAULTS.linkDistance,
        });
        invalidateLayoutConvergenceState();
        return;
      }
      scheduleLayoutRestart(
        'Updating layout for edge length (from load seed)…',
      );
    },
    onEdgeOpacityChange: (opacity) => {
      renderer.edgeOpacity = opacity;
    },
    onForceLayoutPresetChange: (id) => {
      applyPresetToUi(id);
      applyPhysicsChangeWhileIdle();
    },
    onForceLayoutAdvancedChange: (patch) => {
      if (patch.theta !== undefined) advancedTheta = patch.theta;
      if (patch.distanceMin !== undefined)
        advancedDistanceMin = patch.distanceMin;
      if (patch.forceScaleMode !== undefined) {
        advancedForceScaleMode = patch.forceScaleMode;
      }
      if (patch.edgeWeightInfluence !== undefined) {
        advancedEdgeWeightInfluence = patch.edgeWeightInfluence;
      }
      if (patch.linkAttractionMode !== undefined) {
        advancedLinkAttractionMode = patch.linkAttractionMode;
      }
      if (patch.integrationMode !== undefined) {
        advancedIntegrationMode = patch.integrationMode;
      }
      if (patch.clampVelocity !== undefined) {
        advancedClampVelocity = patch.clampVelocity;
      }
      if (patch.recenterOnFinish !== undefined) {
        advancedRecenterOnFinish = patch.recenterOnFinish;
      }
      applyPhysicsChangeWhileIdle();
    },
  },
  PRESETS,
);

applyPresetToUi('interoperability');

// ── Picking ─────────────────────────────────────────────────────────

renderer.picking.setCallbacks({
  onHover: (idx) => {
    renderer.canvas.style.cursor = idx !== null ? 'pointer' : '';
  },
});

renderer.setBeforeFrameCallback((dt) => {
  if (!forceLayout.running) return;
  if (!shouldSmoothLayoutMotion()) return;
  const nc = renderer.graph.nodeCount;
  const tgt = layoutSmoothTo;
  const prev = layoutPrevWorkerTarget;
  const out = layoutSmoothScratch;
  if (nc === 0 || !tgt || !out || tgt.length < nc * 3) return;

  const pos = renderer.graph.positions;
  const n3 = nc * 3;
  /**
   * Chase worker snapshots; τ scales with measured tick spacing.
   * Between sparse (~1/s) ticks, blend in a damped linear extrapolation from the last two snapshots
   * so motion doesn’t freeze waiting for the next physics solve.
   */
  const tauSec = Math.min(0.95, Math.max(0.055, layoutWorkerDtEwma * 0.46));
  const k = 1 - Math.exp(-dt / tauSec);

  const ageSec = (performance.now() - layoutLastWorkerWallMs) / 1000;
  let extrap = 0;
  if (layoutLastWorkerIteration >= 2 && prev && layoutWorkerDtEwma > 0.04) {
    extrap = 0.62 * Math.min(1.25, ageSec / layoutWorkerDtEwma);
  }

  let moved = false;
  for (let i = 0; i < n3; i++) {
    const to = tgt[i]!;
    let aim = to;
    if (extrap > 0 && prev) {
      aim = to + (to - prev[i]!) * extrap;
    }
    const d = aim - pos[i]!;
    out[i] = pos[i]! + d * k;
    if (Math.abs(d) > 1e-9) moved = true;
  }
  if (moved) {
    renderer.graph.updatePositions(out);
  }
});

function graphCentroidXYZ(
  positions: Float32Array,
  nodeCount: number,
): [number, number, number] {
  if (nodeCount <= 0) return [0, 0, 0];
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < nodeCount; i++) {
    cx += positions[i * 3]!;
    cy += positions[i * 3 + 1]!;
    cz += positions[i * 3 + 2]!;
  }
  const inv = 1 / nodeCount;
  return [cx * inv, cy * inv, cz * inv];
}

// ── Draw callback ───────────────────────────────────────────────────

renderer.setDrawCallback((_gl, camera) => {
  if (axesVisible) {
    const { width: cw, height: ch } = renderer.canvas;
    const aspect = ch > 0 ? cw / ch : 1;
    const g = renderer.graph;
    axes.draw(camera, aspect, graphCentroidXYZ(g.positions, g.nodeCount));
    if (renderer.overlay) renderer.overlay.stats.drawCalls += 1;
  }
});

// ── Start with default dataset ──────────────────────────────────────

void loadPreset(PRESETS[0]);
renderer.start();

// ── HMR ─────────────────────────────────────────────────────────────

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    forceLayout.dispose();
    cancelScheduledLayoutRestart();
    panel.dispose();
    axes.dispose();
    renderer.dispose();
  });
}
