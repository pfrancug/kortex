import type {
  EdgeWeightInfluence,
  ForceConfig,
  ForceLayoutPresetId,
  ForceScaleMode,
  IntegrationMode,
  LinkAttractionMode,
  Renderer,
} from '@kortex/core';

// ── Styles ──────────────────────────────────────────────────────────

const PANEL_CSS = `
.kx-panel {
  position: absolute; top: 8px; right: 8px; bottom: 8px;
  width: 280px; max-height: calc(100% - 16px);
  overflow-y: auto; overflow-x: hidden;
  background: rgba(10, 12, 18, 0.88);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  font: 12px/1.5 ui-sans-serif, system-ui, sans-serif;
  color: #c8d0d8; padding: 0;
  z-index: 20; backdrop-filter: blur(12px);
  scrollbar-width: thin;
}
.kx-panel::-webkit-scrollbar { width: 4px; }
.kx-panel::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }
.kx-section { padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.kx-section:last-child { border-bottom: none; }
.kx-title {
  font-size: 10px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.06em; color: #8090a0; margin-bottom: 8px;
}
.kx-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.kx-row:last-child { margin-bottom: 0; }
.kx-label { font-size: 11px; color: #a0aab4; flex: 1; }
.kx-val { font-size: 11px; color: #d8e0e8; min-width: 50px; text-align: right; font-variant-numeric: tabular-nums; }
.kx-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 5px 10px; border: 1px solid rgba(255,255,255,0.12);
  border-radius: 4px; background: rgba(255,255,255,0.05);
  color: #c8d0d8; font-size: 11px; cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.kx-btn:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); }
.kx-btn.active { background: rgba(80,140,255,0.2); border-color: rgba(80,140,255,0.4); color: #90c0ff; }
.kx-btn-group { display: flex; gap: 4px; flex-wrap: wrap; }
.kx-range { width: 100%; accent-color: #5090e0; }
.kx-file-input { display: none; }
.kx-file-label {
  display: flex; align-items: center; justify-content: center;
  padding: 8px; border: 1px dashed rgba(255,255,255,0.15);
  border-radius: 4px; cursor: pointer; font-size: 11px; color: #8090a0;
  transition: border-color 0.15s, color 0.15s;
}
.kx-file-label:hover { border-color: rgba(255,255,255,0.3); color: #c0c8d0; }
.kx-url-input {
  width: 100%; padding: 5px 8px; border: 1px solid rgba(255,255,255,0.12);
  border-radius: 4px; background: rgba(255,255,255,0.04);
  color: #d8e0e8; font-size: 11px; font-family: ui-monospace, monospace;
  outline: none; box-sizing: border-box;
}
.kx-url-input:focus { border-color: rgba(80,140,255,0.4); }
.kx-toggle { position: relative; width: 32px; height: 18px; flex-shrink: 0; cursor: pointer; }
.kx-toggle input { display: none; }
.kx-toggle .track {
  position: absolute; inset: 0; background: rgba(255,255,255,0.1);
  border-radius: 9px; transition: background 0.2s;
}
.kx-toggle input:checked + .track { background: rgba(80,140,255,0.5); }
.kx-toggle .thumb {
  position: absolute; top: 2px; left: 2px; width: 14px; height: 14px;
  background: #c8d0d8; border-radius: 50%; transition: transform 0.2s;
}
.kx-toggle input:checked ~ .thumb { transform: translateX(14px); }
.kx-status { font-size: 10px; color: #607080; padding: 4px 0; }
.kx-select {
  width: 100%; padding: 5px 8px; border: 1px solid rgba(255,255,255,0.12);
  border-radius: 4px; background: rgba(255,255,255,0.06);
  color: #d8e0e8; font-size: 11px; outline: none; box-sizing: border-box;
}
.kx-select:focus { border-color: rgba(80,140,255,0.4); }
.kx-details { margin-top: 10px; }
.kx-details summary {
  cursor: pointer; font-size: 11px; color: #909cac; user-select: none;
  list-style: none;
}
.kx-details summary::-webkit-details-marker { display: none; }
.kx-details summary::before {
  content: '▸ '; display: inline-block; transition: transform 0.15s;
}
.kx-details[open] summary::before { transform: rotate(90deg); }
.kx-details .kx-inner { padding-top: 8px; }
.kx-subtitle {
  font-size: 10px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.05em; color: #6a7888; margin: 14px 0 8px;
}
.kx-section > .kx-subtitle:first-child { margin-top: 4px; }
.kx-loader {
  position: fixed; inset: 0; z-index: 5;
  display: flex; align-items: center; justify-content: center;
  background: rgba(6, 8, 14, 0.65);
  backdrop-filter: blur(4px);
  opacity: 0; pointer-events: none;
  transition: opacity 0.2s;
}
.kx-loader.visible { opacity: 1; }
.kx-loader-inner {
  display: flex; flex-direction: column; align-items: center; gap: 14px;
  color: #c0c8d0; font: 13px/1.5 ui-sans-serif, system-ui, sans-serif;
}
.kx-spinner {
  width: 32px; height: 32px;
  border: 3px solid rgba(255,255,255,0.1);
  border-top-color: #5090e0;
  border-radius: 50%;
  animation: kx-spin 0.7s linear infinite;
}
@keyframes kx-spin { to { transform: rotate(360deg); } }
`;

// ── Types ───────────────────────────────────────────────────────────

export interface DatasetPreset {
  label: string;
  nodeCount: number;
  edgesPerNode: number;
}

/** How billboard radii are derived (`File` = loaded/store sizes). */
export type NodeSizeMode = 'file' | 'degree' | 'incident_weight';

export interface SettingsPanelCallbacks {
  onLoadPreset: (preset: DatasetPreset) => void;
  onLoadFile: (file: File) => void;
  onLoadURL: (url: string) => void;
  /** Download current graph as JSON with node positions (reload without force layout). */
  onExportGraphJson: () => void;
  /** Degree / weight visibility thresholds (demo wiring to graph masks). */
  onGraphFilterChange: (minDegree: number, minWeight: number) => void;
  onEdgeBudgetChange: (budget: number) => void;
  onEdgeSampleChange: (budget: number) => void;
  onEdgeMaxDistChange: (dist: number) => void;
  onProgressiveToggle: (on: boolean) => void;
  onEdgesVisibleToggle: (visible: boolean) => void;
  onForceLayout: () => void;
  onStopLayout: () => void;
  /** Restore node xyz to snapshot taken when the graph was last loaded (preset / file / URL). */
  onResetDatasetPositions: () => void;
  /** d3 `forceCenter` strength toward origin — default **1** (typical d3-style default). */
  onLayoutCenterStrengthChange: (strength: number) => void;
  onLabelsToggle: (visible: boolean) => void;
  onAxesToggle: (visible: boolean) => void;
  /** Cap on nodes that receive labels (scan order). */
  onMaxVisibleLabelsChange: (count: number) => void;
  /** Relative multiplier applied after auto node sizing from the layout bbox + node count. */
  onNodeSizeBiasChange: (bias: number) => void;
  /** Radii from file/parser vs degree vs sum of visible edge weights. */
  onNodeSizeModeChange: (mode: NodeSizeMode) => void;
  /** Scales force-layout ideal link length (`ForceLayout.edgeLengthMultiplier`). */
  onEdgeLengthMultiplierChange: (multiplier: number) => void;
  /** Global edge line opacity (`Renderer.edgeOpacity`, 0–1). */
  onEdgeOpacityChange: (opacity: number) => void;

  /** Barnes–Hut / weighted-edge knobs (see docs/GUIDELINES.md, docs/TODO.md). */
  onForceLayoutPresetChange: (presetId: ForceLayoutPresetId) => void;
  onForceLayoutAdvancedChange: (
    patch: Partial<
      Pick<
        ForceConfig,
        | 'theta'
        | 'distanceMin'
        | 'forceScaleMode'
        | 'edgeWeightInfluence'
        | 'linkAttractionMode'
        | 'integrationMode'
        | 'clampVelocity'
        | 'recenterOnFinish'
      >
    >,
  ) => void;
}

// ── Panel ───────────────────────────────────────────────────────────

export interface ForcePhysicsUiState {
  presetId: ForceLayoutPresetId;
  theta: number;
  distanceMin: number;
  forceScaleMode: ForceScaleMode;
  edgeWeightInfluence: EdgeWeightInfluence;
  linkAttractionMode: LinkAttractionMode;
  integrationMode: IntegrationMode;
  clampVelocity: boolean;
  recenterOnFinish: boolean;
}

export class SettingsPanel {
  readonly element: HTMLDivElement;
  private statusEl!: HTMLDivElement;
  private loaderEl: HTMLDivElement;
  private loaderTextEl: HTMLSpanElement;
  private callbacks: SettingsPanelCallbacks;
  private renderer: Renderer;
  private nodeSizeMode: NodeSizeMode = 'file';

  private phyIgnoreInput = false;
  private phyPresetSelect!: HTMLSelectElement;
  private phyThetaVal!: HTMLSpanElement;
  private phyDistMinVal!: HTMLSpanElement;
  private phyThetaSlider!: HTMLInputElement;
  private phyDistMinSlider!: HTMLInputElement;
  private phyScaleSelect!: HTMLSelectElement;
  private phyWeightSelect!: HTMLSelectElement;
  private phyLinkSelect!: HTMLSelectElement;
  private phyIntSelect!: HTMLSelectElement;
  private phyClampVelInput!: HTMLInputElement;
  private phyRecenterInput!: HTMLInputElement;
  private nodeSizeBiasSlider!: HTMLInputElement;
  private nodeSizeBiasVal!: HTMLSpanElement;

  constructor(
    parent: HTMLElement,
    renderer: Renderer,
    callbacks: SettingsPanelCallbacks,
    presets: DatasetPreset[],
  ) {
    this.callbacks = callbacks;
    this.renderer = renderer;

    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    document.head.appendChild(style);

    this.element = document.createElement('div');
    this.element.className = 'kx-panel';
    parent.appendChild(this.element);

    // Fullscreen loading overlay
    this.loaderEl = document.createElement('div');
    this.loaderEl.className = 'kx-loader';
    const inner = document.createElement('div');
    inner.className = 'kx-loader-inner';
    inner.innerHTML = '<div class="kx-spinner"></div>';
    this.loaderTextEl = document.createElement('span');
    this.loaderTextEl.textContent = 'Generating graph...';
    inner.appendChild(this.loaderTextEl);
    this.loaderEl.appendChild(inner);
    document.body.appendChild(this.loaderEl);

    this.buildDataSection(presets);
    this.buildLayoutSection();
    this.buildRendererSection();
    this.buildGraphFiltersSection();
    this.buildEdgeSection();
    this.buildLODSection();
    this.buildDisplaySection();
    this.buildStatusSection();
  }

  setStatus(text: string): void {
    this.statusEl.textContent = text;
  }

  /** Sync physics widgets after preset change or external reset (no callbacks fired). */
  syncForcePhysicsControls(state: ForcePhysicsUiState): void {
    this.phyIgnoreInput = true;
    try {
      this.phyPresetSelect.value = state.presetId;
      this.phyThetaSlider.value = String(state.theta);
      this.phyThetaVal.textContent = state.theta.toFixed(2);
      this.phyDistMinSlider.value = String(state.distanceMin);
      this.phyDistMinVal.textContent = state.distanceMin.toFixed(2);
      this.phyScaleSelect.value = state.forceScaleMode;
      this.phyWeightSelect.value = state.edgeWeightInfluence;
      this.phyLinkSelect.value = state.linkAttractionMode;
      this.phyIntSelect.value = state.integrationMode;
      this.phyClampVelInput.checked = state.clampVelocity;
      this.phyRecenterInput.checked = state.recenterOnFinish;
    } finally {
      this.phyIgnoreInput = false;
    }
  }

  syncNodeSizeBias(bias: number): void {
    const v = Number.isFinite(bias) ? bias : 1;
    this.nodeSizeBiasSlider.value = String(v);
    this.nodeSizeBiasVal.textContent = `${v.toFixed(2)}×`;
  }

  showLoader(text = 'Generating graph...'): void {
    this.loaderTextEl.textContent = text;
    this.loaderEl.classList.add('visible');
    this.renderer.controls.enabled = false;
  }

  hideLoader(): void {
    this.loaderEl.classList.remove('visible');
    this.renderer.controls.enabled = true;
  }

  dispose(): void {
    this.element.remove();
    this.loaderEl.remove();
  }

  // ── Sections ────────────────────────────────────────────────────

  private buildDataSection(presets: DatasetPreset[]): void {
    const sec = this.section('Data');

    // Presets
    const group = el('div', 'kx-btn-group');
    for (const p of presets) {
      const btn = el('button', 'kx-btn');
      btn.textContent = p.label;
      btn.addEventListener('click', () => this.callbacks.onLoadPreset(p));
      group.appendChild(btn);
    }
    sec.appendChild(group);

    // File input
    const fileInput = el('input', 'kx-file-input') as HTMLInputElement;
    fileInput.type = 'file';
    fileInput.accept = '.json,.csv';
    fileInput.addEventListener('change', () => {
      if (fileInput.files?.[0]) {
        this.callbacks.onLoadFile(fileInput.files[0]);
        fileInput.value = '';
      }
    });
    const fileLabel = el('label', 'kx-file-label');
    fileLabel.textContent = 'Drop file or click to load (JSON / CSV)';
    fileLabel.appendChild(fileInput);
    // Do not call fileInput.click() here: the label already activates the nested
    // input, and an extra programmatic click opens the picker twice.
    sec.appendChild(fileLabel);

    // URL input
    const urlRow = el('div', 'kx-row');
    const urlInput = el('input', 'kx-url-input') as HTMLInputElement;
    urlInput.placeholder = 'https://... (Enter to load)';
    urlInput.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' && urlInput.value.trim()) {
        this.callbacks.onLoadURL(urlInput.value.trim());
        urlInput.value = '';
      }
    });
    urlRow.appendChild(urlInput);
    sec.appendChild(urlRow);

    const exportBtn = el('button', 'kx-btn') as HTMLButtonElement;
    exportBtn.type = 'button';
    exportBtn.textContent = 'Export JSON (with positions)';
    exportBtn.title =
      'Download labels, current x/y/z per node, and edges. Re-import skips auto-layout.';
    exportBtn.addEventListener('click', () =>
      this.callbacks.onExportGraphJson(),
    );
    sec.appendChild(exportBtn);
  }

  private buildLayoutSection(): void {
    const sec = this.section('Layout');
    const group = el('div', 'kx-btn-group');

    const startBtn = el('button', 'kx-btn');
    startBtn.textContent = 'Auto Layout';
    startBtn.title =
      'Runs the solver once. Repeat clicks do nothing if physics match the last convergence. While idle, changing physics re-runs automatically after a short pause.';
    startBtn.addEventListener('click', () => this.callbacks.onForceLayout());
    group.appendChild(startBtn);

    const stopBtn = el('button', 'kx-btn');
    stopBtn.textContent = 'Stop';
    stopBtn.title = 'Interrupts the worker; positions stay where they are.';
    stopBtn.addEventListener('click', () => this.callbacks.onStopLayout());
    group.appendChild(stopBtn);

    const resetBtn = el('button', 'kx-btn');
    resetBtn.textContent = 'Reset';
    resetBtn.title =
      'Restore node xyz from when this graph was loaded (preset / file / URL).';
    resetBtn.addEventListener('click', () =>
      this.callbacks.onResetDatasetPositions(),
    );
    group.appendChild(resetBtn);

    sec.appendChild(group);
  }

  /** Force simulation + layout multiplier — grouped under Renderer for discoverability. */
  private appendForceSimulationControls(sec: HTMLElement): void {
    this.subsectionTitle(sec, 'Force simulation');

    const presetRow = el('div', 'kx-row');
    const presetLbl = el('span', 'kx-label');
    presetLbl.textContent = 'Physics preset';
    presetLbl.title =
      'Interoperability: nominal charge/link, d3-like links. Stability: auto scale + legacy springs/tick order.';
    presetRow.appendChild(presetLbl);
    sec.appendChild(presetRow);

    this.phyPresetSelect = el('select', 'kx-select') as HTMLSelectElement;
    for (const opt of [
      { v: 'interoperability', t: 'Interoperability' },
      { v: 'stability', t: 'Stability (dense)' },
    ] as const) {
      const o = document.createElement('option');
      o.value = opt.v;
      o.textContent = opt.t;
      this.phyPresetSelect.appendChild(o);
    }
    this.phyPresetSelect.addEventListener('change', () => {
      if (this.phyIgnoreInput) return;
      this.callbacks.onForceLayoutPresetChange(
        this.phyPresetSelect.value as ForceLayoutPresetId,
      );
    });
    sec.appendChild(this.phyPresetSelect);

    this.sliderRow(
      sec,
      'Center gravity',
      0,
      3,
      1,
      0.05,
      (v) => this.callbacks.onLayoutCenterStrengthChange(v),
      'd3 forceCenter strength toward (0,0,0). Default in libraries is 1; 0 disables.',
    );

    this.sliderRowMultiplier(
      sec,
      'Edge length (layout)',
      0.25,
      3,
      1,
      0.05,
      (v) => this.callbacks.onEdgeLengthMultiplierChange(v),
    );

    const adv = el('details', 'kx-details') as HTMLDetailsElement;
    const sum = el('summary', '');
    sum.textContent = 'Advanced force parameters';
    adv.appendChild(sum);
    const inner = el('div', 'kx-inner');
    adv.appendChild(inner);

    const thetaRow = el('div', 'kx-row');
    const thetaLbl = el('span', 'kx-label');
    thetaLbl.textContent = 'Barnes–Hut θ';
    thetaLbl.title =
      'Opening criterion (d3 default ≈ 0.9). Lower = more accurate, slower.';
    this.phyThetaVal = el('span', 'kx-val') as HTMLSpanElement;
    thetaRow.appendChild(thetaLbl);
    thetaRow.appendChild(this.phyThetaVal);
    inner.appendChild(thetaRow);
    this.phyThetaSlider = document.createElement('input');
    this.phyThetaSlider.type = 'range';
    this.phyThetaSlider.className = 'kx-range';
    this.phyThetaSlider.min = '0.35';
    this.phyThetaSlider.max = '1.2';
    this.phyThetaSlider.step = '0.05';
    this.phyThetaSlider.addEventListener('input', () => {
      if (this.phyIgnoreInput) return;
      const v = Number(this.phyThetaSlider.value);
      this.phyThetaVal.textContent = v.toFixed(2);
      this.callbacks.onForceLayoutAdvancedChange({ theta: v });
    });
    inner.appendChild(this.phyThetaSlider);

    const dmRow = el('div', 'kx-row');
    const dmLbl = el('span', 'kx-label');
    dmLbl.textContent = 'Charge distanceMin';
    dmLbl.title = 'Minimum distance² floor for repulsion (d3 default 1).';
    this.phyDistMinVal = el('span', 'kx-val') as HTMLSpanElement;
    dmRow.appendChild(dmLbl);
    dmRow.appendChild(this.phyDistMinVal);
    inner.appendChild(dmRow);
    this.phyDistMinSlider = document.createElement('input');
    this.phyDistMinSlider.type = 'range';
    this.phyDistMinSlider.className = 'kx-range';
    this.phyDistMinSlider.min = '0.1';
    this.phyDistMinSlider.max = '4';
    this.phyDistMinSlider.step = '0.05';
    this.phyDistMinSlider.addEventListener('input', () => {
      if (this.phyIgnoreInput) return;
      const v = Number(this.phyDistMinSlider.value);
      this.phyDistMinVal.textContent = v.toFixed(2);
      this.callbacks.onForceLayoutAdvancedChange({ distanceMin: v });
    });
    inner.appendChild(this.phyDistMinSlider);

    const scaleLblRow = el('div', 'kx-row');
    const scaleLbl = el('span', 'kx-label');
    scaleLbl.textContent = 'Force scale mode';
    scaleLbl.title =
      'None: nominal link distance / charge. Auto: rescale from graph size.';
    scaleLblRow.appendChild(scaleLbl);
    inner.appendChild(scaleLblRow);
    this.phyScaleSelect = el('select', 'kx-select') as HTMLSelectElement;
    for (const opt of [
      { v: 'none', t: 'none (nominal)' },
      { v: 'auto', t: 'auto (graph size)' },
    ] as const) {
      const o = document.createElement('option');
      o.value = opt.v;
      o.textContent = opt.t;
      this.phyScaleSelect.appendChild(o);
    }
    this.phyScaleSelect.addEventListener('change', () => {
      if (this.phyIgnoreInput) return;
      this.callbacks.onForceLayoutAdvancedChange({
        forceScaleMode: this.phyScaleSelect.value as ForceScaleMode,
      });
    });
    inner.appendChild(this.phyScaleSelect);

    const wLblRow = el('div', 'kx-row');
    const wLbl = el('span', 'kx-label');
    wLbl.textContent = 'Edge weight influence';
    wLbl.title =
      'When the loaded graph has per-edge weights. Uniform weights behave like off.';
    wLblRow.appendChild(wLbl);
    inner.appendChild(wLblRow);
    this.phyWeightSelect = el('select', 'kx-select') as HTMLSelectElement;
    for (const opt of [
      { v: 'off', t: 'off' },
      { v: 'linkStrength', t: 'link strength (∝√w)' },
      { v: 'linkDistance', t: 'link distance (∝1/√w)' },
      { v: 'both', t: 'both' },
    ] as const) {
      const o = document.createElement('option');
      o.value = opt.v;
      o.textContent = opt.t;
      this.phyWeightSelect.appendChild(o);
    }
    this.phyWeightSelect.addEventListener('change', () => {
      if (this.phyIgnoreInput) return;
      this.callbacks.onForceLayoutAdvancedChange({
        edgeWeightInfluence: this.phyWeightSelect.value as EdgeWeightInfluence,
      });
    });
    inner.appendChild(this.phyWeightSelect);

    const linkLblRow = el('div', 'kx-row');
    const linkLbl = el('span', 'kx-label');
    linkLbl.textContent = 'Link attraction';
    linkLbl.title =
      'd3-like: velocity-aware springs. Position-only: legacy stability path.';
    linkLblRow.appendChild(linkLbl);
    inner.appendChild(linkLblRow);
    this.phyLinkSelect = el('select', 'kx-select') as HTMLSelectElement;
    for (const opt of [
      { v: 'd3_like', t: 'd3-like' },
      { v: 'kortex_custom', t: 'position-only (legacy)' },
    ] as const) {
      const o = document.createElement('option');
      o.value = opt.v;
      o.textContent = opt.t;
      this.phyLinkSelect.appendChild(o);
    }
    this.phyLinkSelect.addEventListener('change', () => {
      if (this.phyIgnoreInput) return;
      this.callbacks.onForceLayoutAdvancedChange({
        linkAttractionMode: this.phyLinkSelect.value as LinkAttractionMode,
      });
    });
    inner.appendChild(this.phyLinkSelect);

    const intLblRow = el('div', 'kx-row');
    const intLbl = el('span', 'kx-label');
    intLbl.textContent = 'Integration tick';
    intLbl.title =
      'Standard: link forces then charge (d3 order). Legacy: charge then link.';
    intLblRow.appendChild(intLbl);
    inner.appendChild(intLblRow);
    this.phyIntSelect = el('select', 'kx-select') as HTMLSelectElement;
    for (const opt of [
      { v: 'standard', t: 'standard (link→charge)' },
      { v: 'legacy', t: 'legacy (charge→link)' },
    ] as const) {
      const o = document.createElement('option');
      o.value = opt.v;
      o.textContent = opt.t;
      this.phyIntSelect.appendChild(o);
    }
    this.phyIntSelect.addEventListener('change', () => {
      if (this.phyIgnoreInput) return;
      this.callbacks.onForceLayoutAdvancedChange({
        integrationMode: this.phyIntSelect.value as IntegrationMode,
      });
    });
    inner.appendChild(this.phyIntSelect);

    const clampRow = el('div', 'kx-row');
    const clampLbl = el('span', 'kx-label');
    clampLbl.textContent = 'Clamp max velocity';
    clampLbl.title =
      'When on, speed per node is capped by maxVelocity in worker defaults.';
    clampRow.appendChild(clampLbl);
    const clampToggle = el('label', 'kx-toggle');
    this.phyClampVelInput = document.createElement('input');
    this.phyClampVelInput.type = 'checkbox';
    this.phyClampVelInput.checked = true;
    const clampTrack = el('span', 'track');
    const clampThumb = el('span', 'thumb');
    clampToggle.appendChild(this.phyClampVelInput);
    clampToggle.appendChild(clampTrack);
    clampToggle.appendChild(clampThumb);
    this.phyClampVelInput.addEventListener('change', () => {
      if (this.phyIgnoreInput) return;
      this.callbacks.onForceLayoutAdvancedChange({
        clampVelocity: this.phyClampVelInput.checked,
      });
    });
    clampRow.appendChild(clampToggle);
    inner.appendChild(clampRow);

    const recentRow = el('div', 'kx-row');
    const recentLbl = el('span', 'kx-label');
    recentLbl.textContent = 'Recenter when stable';
    recentLbl.title =
      'After convergence, shift centroid to layout center (camera-fit helper).';
    recentRow.appendChild(recentLbl);
    const recentToggle = el('label', 'kx-toggle');
    this.phyRecenterInput = document.createElement('input');
    this.phyRecenterInput.type = 'checkbox';
    this.phyRecenterInput.checked = false;
    const recentTrack = el('span', 'track');
    const recentThumb = el('span', 'thumb');
    recentToggle.appendChild(this.phyRecenterInput);
    recentToggle.appendChild(recentTrack);
    recentToggle.appendChild(recentThumb);
    this.phyRecenterInput.addEventListener('change', () => {
      if (this.phyIgnoreInput) return;
      this.callbacks.onForceLayoutAdvancedChange({
        recenterOnFinish: this.phyRecenterInput.checked,
      });
    });
    recentRow.appendChild(recentToggle);
    inner.appendChild(recentRow);

    sec.appendChild(adv);
  }

  private buildGraphFiltersSection(): void {
    const sec = this.section('Graph filters');
    let minDegree = 1;
    let minWeight = 1;
    const emit = (): void => {
      this.callbacks.onGraphFilterChange(minDegree, minWeight);
    };

    const mk = (label: string, key: 'degree' | 'weight'): void => {
      const row = el('div', 'kx-row');
      const lbl = el('span', 'kx-label');
      lbl.textContent = label;
      const val = el('span', 'kx-val');
      val.textContent =
        key === 'degree' ? String(minDegree) : String(minWeight);
      row.appendChild(lbl);
      row.appendChild(val);
      sec.appendChild(row);

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'kx-range';
      slider.min = '1';
      slider.max = '100';
      slider.step = '1';
      slider.value = key === 'degree' ? String(minDegree) : String(minWeight);
      slider.addEventListener('input', () => {
        const v = Number(slider.value);
        if (key === 'degree') minDegree = v;
        else minWeight = v;
        val.textContent = String(v);
        emit();
      });
      sec.appendChild(slider);
    };

    mk('Degree ≥', 'degree');
    mk('Weight ≥', 'weight');
    emit();
  }

  private buildEdgeSection(): void {
    const sec = this.section('Edges');

    // Visible toggle
    this.toggleRow(sec, 'Show edges', true, (on) =>
      this.callbacks.onEdgesVisibleToggle(on),
    );

    // Budget slider
    this.sliderRow(sec, 'Budget (0=off)', 0, 2_000_000, 0, 10_000, (v) =>
      this.callbacks.onEdgeBudgetChange(v),
    );

    // Sample slider
    this.sliderRow(sec, 'Sample (0=off)', 0, 2_000_000, 0, 10_000, (v) =>
      this.callbacks.onEdgeSampleChange(v),
    );
  }

  private buildLODSection(): void {
    const sec = this.section('LOD');

    this.sliderRow(sec, 'Edge draw dist (0=all)', 0, 100, 0, 1, (v) =>
      this.callbacks.onEdgeMaxDistChange(v),
    );

    this.toggleRow(sec, 'Progressive load', true, (on) =>
      this.callbacks.onProgressiveToggle(on),
    );
  }

  private buildRendererSection(): void {
    const sec = this.section('Renderer');

    this.appendForceSimulationControls(sec);

    this.subsectionTitle(sec, 'Draw style');

    this.buildNodeSizeModeRow(sec);

    {
      const row = el('div', 'kx-row');
      const lbl = el('span', 'kx-label');
      lbl.textContent = 'Node size × fit';
      lbl.setAttribute(
        'title',
        'Adjusts auto billboard sizing (from layout extent + node count). 1× = recommended.',
      );
      const val = el('span', 'kx-val');
      val.textContent = '1.00×';
      row.appendChild(lbl);
      row.appendChild(val);
      sec.appendChild(row);

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'kx-range';
      slider.min = '0.25';
      slider.max = '10';
      slider.step = '0.05';
      slider.value = '1';
      slider.title =
        'Multiply the automatically chosen node scale (bbox + density).';
      this.nodeSizeBiasSlider = slider;
      this.nodeSizeBiasVal = val;
      slider.addEventListener('input', () => {
        const v = Number(slider.value);
        val.textContent = `${v.toFixed(2)}×`;
        this.callbacks.onNodeSizeBiasChange(v);
      });
      sec.appendChild(slider);
    }

    this.sliderRowCount(
      sec,
      'Edge opacity',
      'Multiplies edge fragment alpha (0 = invisible lines).',
      0,
      100,
      25,
      5,
      (v) => this.callbacks.onEdgeOpacityChange(v / 100),
    );
  }

  private buildNodeSizeModeRow(sec: HTMLElement): void {
    const row = el('div', 'kx-row');
    const lbl = el('span', 'kx-label');
    lbl.textContent = 'Size nodes by';
    lbl.setAttribute(
      'title',
      'File: radii from generator / JSON / CSV. Degree / Σ weight: visible incidence; sphere heuristic 4×∛max(1, metric/10).',
    );
    row.appendChild(lbl);
    sec.appendChild(row);

    const group = el('div', 'kx-btn-group');
    const modes: NodeSizeMode[] = ['file', 'degree', 'incident_weight'];
    const captions: Record<NodeSizeMode, string> = {
      file: 'File',
      degree: 'Degree',
      incident_weight: 'Σ weight',
    };
    const buttons = new Map<NodeSizeMode, HTMLButtonElement>();

    const sync = (): void => {
      for (const m of modes) {
        buttons.get(m)?.classList.toggle('active', m === this.nodeSizeMode);
      }
    };

    for (const m of modes) {
      const btn = el('button', 'kx-btn') as HTMLButtonElement;
      btn.textContent = captions[m];
      btn.addEventListener('click', () => {
        if (this.nodeSizeMode === m) return;
        this.nodeSizeMode = m;
        sync();
        this.callbacks.onNodeSizeModeChange(m);
      });
      buttons.set(m, btn);
      group.appendChild(btn);
    }
    sec.appendChild(group);
    sync();
  }

  private buildDisplaySection(): void {
    const sec = this.section('Display');
    this.toggleRow(sec, 'Node labels', true, (on) =>
      this.callbacks.onLabelsToggle(on),
    );
    this.sliderRowCount(
      sec,
      'Max labels',
      'Visible nodes only, in node-index order (lower for FPS).',
      0,
      12_000,
      500,
      50,
      (v) => this.callbacks.onMaxVisibleLabelsChange(v),
    );
    this.toggleRow(sec, 'Axes grid', true, (on) =>
      this.callbacks.onAxesToggle(on),
    );
  }

  private buildStatusSection(): void {
    const sec = this.section('Status');
    this.statusEl = el('div', 'kx-status') as HTMLDivElement;
    this.statusEl.textContent = 'Ready';
    sec.appendChild(this.statusEl);
  }

  // ── Helpers ─────────────────────────────────────────────────────

  private section(title: string): HTMLDivElement {
    const sec = el('div', 'kx-section') as HTMLDivElement;
    const h = el('div', 'kx-title');
    h.textContent = title;
    sec.appendChild(h);
    this.element.appendChild(sec);
    return sec;
  }

  private subsectionTitle(parent: HTMLElement, text: string): void {
    const s = el('div', 'kx-subtitle');
    s.textContent = text;
    parent.appendChild(s);
  }

  private sliderRow(
    parent: HTMLElement,
    label: string,
    min: number,
    max: number,
    initial: number,
    step: number,
    onChange: (v: number) => void,
    labelTitle?: string,
  ): void {
    const row = el('div', 'kx-row');
    const lbl = el('span', 'kx-label');
    lbl.textContent = label;
    if (labelTitle) lbl.setAttribute('title', labelTitle);
    const val = el('span', 'kx-val');
    val.textContent = fmt(initial);
    row.appendChild(lbl);
    row.appendChild(val);
    parent.appendChild(row);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'kx-range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(initial);
    if (labelTitle) slider.title = labelTitle;
    slider.addEventListener('input', () => {
      const v = Number(slider.value);
      val.textContent = fmt(v);
      onChange(v);
    });
    parent.appendChild(slider);
  }

  /** Integer slider with plain numeric display (unlike {@link sliderRow} `fmt`). */
  private sliderRowCount(
    parent: HTMLElement,
    label: string,
    title: string,
    min: number,
    max: number,
    initial: number,
    step: number,
    onChange: (v: number) => void,
  ): void {
    const row = el('div', 'kx-row');
    const lbl = el('span', 'kx-label');
    lbl.textContent = label;
    lbl.setAttribute('title', title);
    const val = el('span', 'kx-val');
    val.textContent = String(initial);
    row.appendChild(lbl);
    row.appendChild(val);
    parent.appendChild(row);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'kx-range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(initial);
    slider.setAttribute('title', title);
    slider.addEventListener('input', () => {
      const v = Number(slider.value);
      val.textContent = String(v);
      onChange(v);
    });
    parent.appendChild(slider);
  }

  private sliderRowMultiplier(
    parent: HTMLElement,
    label: string,
    min: number,
    max: number,
    initial: number,
    step: number,
    onChange: (v: number) => void,
  ): void {
    const row = el('div', 'kx-row');
    const lbl = el('span', 'kx-label');
    lbl.textContent = label;
    const val = el('span', 'kx-val');
    val.textContent = `${initial.toFixed(2)}×`;
    row.appendChild(lbl);
    row.appendChild(val);
    parent.appendChild(row);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'kx-range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(initial);
    slider.addEventListener('input', () => {
      const v = Number(slider.value);
      val.textContent = `${v.toFixed(2)}×`;
      onChange(v);
    });
    parent.appendChild(slider);
  }

  private toggleRow(
    parent: HTMLElement,
    label: string,
    initial: boolean,
    onChange: (on: boolean) => void,
  ): void {
    const row = el('div', 'kx-row');
    const lbl = el('span', 'kx-label');
    lbl.textContent = label;
    row.appendChild(lbl);

    const toggle = el('label', 'kx-toggle');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = initial;
    const track = el('span', 'track');
    const thumb = el('span', 'thumb');
    toggle.appendChild(input);
    toggle.appendChild(track);
    toggle.appendChild(thumb);
    input.addEventListener('change', () => onChange(input.checked));
    row.appendChild(toggle);
    parent.appendChild(row);
  }
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

function fmt(n: number): string {
  if (n === 0) return 'off';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}
