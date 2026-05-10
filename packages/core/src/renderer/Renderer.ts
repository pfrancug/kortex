import { Camera } from './Camera';
import { DebugOverlay } from './DebugOverlay';
import { EdgeRenderer } from './EdgeRenderer';
import { FrustumCuller } from './FrustumCuller';
import { LabelRenderer, LABEL_MAX_NODES_PER_BUILD } from './LabelRenderer';
import { NodeRenderer } from './NodeRenderer';
import { OrbitControls } from './OrbitControls';
import { RenderLoop } from './RenderLoop';
import { createSdfAtlas } from './SdfAtlas';
import { createWebGL2Context, type ContextOptions } from './gl/context';
import {
  normalizeBackgroundColor,
  type BackgroundColor,
} from './backgroundColor';
import { GraphStore } from '../graph/GraphStore';
import { ChunkIndex, type ChunkRange } from '../graph/ChunkIndex';
import { PickingSystem } from '../interaction/PickingSystem';
import { LODController, type LODSettings } from '../lod/LODController';
import { typicalStoredRadius } from '../layout/autoNodeScale';

/**
 * Callback invoked each frame for custom draw commands.
 * @param gl - The WebGL2 rendering context.
 * @param camera - The current camera (view/projection already updated).
 * @param dt - Delta time in seconds since the previous frame.
 */
export type DrawCallback = (
  gl: WebGL2RenderingContext,
  camera: Camera,
  dt: number,
) => void;

/** Runs after camera matrices update and before graph draws — use for per-frame smoothing. */
export type BeforeFrameCallback = (dt: number) => void;

/** Positive finite scale for {@link Renderer.nodeSizeMultiplier} (invalid → `1`). */
export function clampPresentationScale(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 1;
  return Math.min(x, 1e6);
}

/** Clamp edge draw opacity for {@link Renderer.edgeOpacity} (invalid / non-positive → `0`). */
export function clampEdgeOpacity(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 0;
  return Math.min(x, 1);
}

/** Clamp node billboard opacity for {@link Renderer.nodeOpacity} (same rules as {@link clampEdgeOpacity}). */
export const clampNodeOpacity = clampEdgeOpacity;

/**
 * Explicit “use the label GPU maximum” ({@link LABEL_MAX_NODES_PER_BUILD} nodes per rebuild).
 * Omitting {@link RendererOptions.maxVisibleLabels} already uses this budget; positive infinity is treated the same.
 */
export const MAX_VISIBLE_LABELS_UNLIMITED = -1;

/** Clamp requested label-node budget for {@link Renderer.maxVisibleLabels}. */
export function clampVisibleLabelCount(n: number): number {
  if (
    n === MAX_VISIBLE_LABELS_UNLIMITED ||
    n === Infinity ||
    n === Number.POSITIVE_INFINITY
  ) {
    return LABEL_MAX_NODES_PER_BUILD;
  }
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), LABEL_MAX_NODES_PER_BUILD);
}

/** Configuration for {@link Renderer} construction. */
export interface RendererOptions {
  /** Container element; the canvas is appended as a child. */
  parent: HTMLElement;
  /** Cap on `devicePixelRatio` to limit GPU load. @defaultValue 2 */
  pixelRatioCap?: number;
  /** Forwarded to `canvas.getContext('webgl2', ...)`. */
  contextOptions?: ContextOptions;
  /** Show the debug overlay (FPS, draw calls, etc.). @defaultValue false unless set true */
  showOverlay?: boolean;
  /** LOD / scalability settings. */
  lod?: Partial<LODSettings>;
  /**
   * Scales node billboard / hit radius vs {@link GraphStore.sizes}.
   * @defaultValue 1
   */
  nodeSizeMultiplier?: number;
  /**
   * Maximum nodes that receive text labels per frame (scan order; skips invisible nodes).
   * When omitted, uses the largest budget the label path allows ({@link LABEL_MAX_NODES_PER_BUILD}).
   * {@link MAX_VISIBLE_LABELS_UNLIMITED} and positive infinity match that same budget.
   * Invalid / non-positive finite values → **0** (no labels).
   */
  maxVisibleLabels?: number;
  /** Edge line transparency — multiplied with per-edge alpha in the edge shader. @defaultValue 1 */
  edgeOpacity?: number;
  /** Node billboard transparency — multiplied with per-node attribute alpha (and rim AA) in the node shader. @defaultValue 1 */
  nodeOpacity?: number;
  /**
   * Color buffer clear color (`gl.clearColor`) each frame.
   * CSS hex (`#RGB`, `#RRGGBB`, `#RRGGBBAA`) or linear **0–1** `[r,g,b]` / `[r,g,b,a]`.
   * @defaultValue `'#0f1217'` (previous built-in context default).
   */
  backgroundColor?: BackgroundColor;
  /**
   * When **false**, the clicked node does not get the selection rim in {@link NodeRenderer}.
   * {@link PickingSystem} still updates selection for **`onSelect`** callbacks.
   * @defaultValue true
   */
  selectionHighlight?: boolean;
}

/**
 * Top-level renderer. Owns the canvas, camera, graph store,
 * picking system, and render loop. This is the main entry point.
 *
 * @example
 * ```ts
 * const renderer = new Renderer({ parent: document.body });
 * renderer.graph.setNodes(positions);
 * renderer.graph.setEdges(indices);
 * renderer.start();
 * ```
 */
export class Renderer {
  /** The canvas element inserted into the parent container. */
  readonly canvas: HTMLCanvasElement;
  /** The WebGL2 rendering context. */
  readonly gl: WebGL2RenderingContext;
  /** Orbit camera (modify `camera.state` to change viewpoint). */
  readonly camera: Camera;
  /** Mouse/touch orbit controls bound to the canvas. */
  readonly controls: OrbitControls;
  /** Debug overlay element, or `null` if disabled. */
  get overlay(): DebugOverlay | null {
    return this.debugOverlay;
  }
  /** Graph data store — call `setNodes`/`setEdges` to populate. */
  readonly graph: GraphStore;
  /** Pointer picking (CPU, no readPixels) — fires hover/select callbacks. */
  readonly picking: PickingSystem;
  /** LOD controller — configure edge budgets, fading, sampling. */
  readonly lod: LODController;

  /**
   * Scales every node's billboard and pointer-hit sphere vs stored sizes.
   * Edge spacing is controlled separately via {@link ForceLayout.edgeLengthMultiplier}.
   */
  nodeSizeMultiplier: number;

  /**
   * Budget for how many nodes receive labels each frame (before glyph/instance limits in {@link LabelRenderer}).
   * Writable; values are clamped with {@link clampVisibleLabelCount}.
   */
  maxVisibleLabels: number;

  /**
   * Global multiplier on edge fragment alpha ({@link EdgeRenderer.edgeAlpha}), after per-edge attribute alpha from {@link GraphStore.edgeColors}.
   * Does not change stored edge colors.
   */
  edgeOpacity: number;

  /**
   * Global multiplier on node billboard alpha after lighting (multiplies the attribute alpha from {@link GraphStore.colors}, then edge falloff in the fragment shader).
   * Does not change stored colors.
   */
  nodeOpacity: number;

  /**
   * When **false**, {@link NodeRenderer} ignores {@link PickingSystem.selectedNode} for the selection rim.
   */
  selectionHighlight: boolean;

  private _backgroundColor?: BackgroundColor;

  /**
   * Canvas clear color — same formats as {@link RendererOptions.backgroundColor}.
   * Assigning **`undefined`** restores the package default (`#0f1217`).
   */
  get backgroundColor(): BackgroundColor | undefined {
    return this._backgroundColor;
  }

  set backgroundColor(value: BackgroundColor | undefined) {
    this._backgroundColor = value;
    const n = normalizeBackgroundColor(value);
    this.gl.clearColor(n[0], n[1], n[2], n[3]);
  }

  private readonly parent: HTMLElement;
  private readonly loop: RenderLoop;
  private readonly resizeObserver: ResizeObserver;
  private pixelRatioCap: number;
  private debugOverlay: DebugOverlay | null = null;
  private nodeRenderer: NodeRenderer | null = null;
  private edgeRenderer: EdgeRenderer | null = null;
  private labelRenderer: LabelRenderer | null = null;
  private drawCallback: DrawCallback | null = null;
  private beforeFrameCallback: BeforeFrameCallback | null = null;
  private labelsVisible = true;
  private readonly frustum = new FrustumCuller();
  private readonly chunkIndex = new ChunkIndex();
  private readonly nodeChunks: ChunkRange[] = [];
  private readonly edgeChunks: ChunkRange[] = [];
  private lastChunkPositionVersion = -1;
  private lastLabelPositionVersion = -1;
  private lastLabelSizeVersion = -1;
  private lastLabelBuildCap = -1;
  private lastPickPositionVersion = -1;
  private lastLayoutHoverInvalidateAt = 0;
  private readonly prevVpForPick = new Float32Array(16);
  private prevVpPickInitialized = false;
  private width = 1;
  private height = 1;

  constructor(options: RendererOptions) {
    this.pixelRatioCap = options.pixelRatioCap ?? 2;
    this.nodeSizeMultiplier = clampPresentationScale(
      options.nodeSizeMultiplier ?? 1,
    );
    this.maxVisibleLabels = clampVisibleLabelCount(
      options.maxVisibleLabels ?? MAX_VISIBLE_LABELS_UNLIMITED,
    );
    this.edgeOpacity = clampEdgeOpacity(options.edgeOpacity ?? 1);
    this.nodeOpacity = clampNodeOpacity(options.nodeOpacity ?? 1);
    this.selectionHighlight = options.selectionHighlight !== false;
    this.parent = options.parent;

    if (!this.parent.style.position) {
      this.parent.style.position = 'relative';
    }

    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText =
      'display:block;width:100%;height:100%;touch-action:none;outline:none;';
    this.canvas.tabIndex = 0;
    this.parent.appendChild(this.canvas);

    this.gl = createWebGL2Context(this.canvas, options.contextOptions);
    this.backgroundColor = options.backgroundColor;
    this.camera = new Camera();
    this.controls = new OrbitControls(this.canvas, this.camera);
    this.debugOverlay =
      options.showOverlay === true
        ? new DebugOverlay(this.parent, this.gl)
        : null;

    this.graph = new GraphStore();
    this.graph.attach(this.gl);
    const gpuBuf = this.graph.getBuffers();
    if (gpuBuf) {
      this.nodeRenderer = new NodeRenderer(this.gl, gpuBuf);
      this.edgeRenderer = new EdgeRenderer(this.gl, gpuBuf);
    }

    const atlas = createSdfAtlas(this.gl);
    this.labelRenderer = new LabelRenderer(this.gl, atlas);

    this.picking = new PickingSystem(this.canvas);
    this.lod = new LODController(options.lod);

    this.loop = new RenderLoop(this.frame);
    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(this.parent);
    this.onResize();
  }

  /** Register a callback for custom draw commands each frame. */
  setDrawCallback(callback: DrawCallback | null): void {
    this.drawCallback = callback;
  }

  /** Optional hook after {@link Camera.update}, before chunk rebuild / draws (e.g. layout smoothing). */
  setBeforeFrameCallback(callback: BeforeFrameCallback | null): void {
    this.beforeFrameCallback = callback;
  }

  /** Show or hide node labels. */
  setLabelsVisible(visible: boolean): void {
    if (visible && !this.labelsVisible) {
      this.lastLabelPositionVersion = -1;
      this.lastLabelSizeVersion = -1;
    }
    this.labelsVisible = visible;
  }

  /** Auto-fit camera to frame all nodes. */
  fitToData(): void {
    const n = this.graph.nodeCount;
    if (n === 0) return;
    const pos = this.graph.positions;

    let cx = 0,
      cy = 0,
      cz = 0;
    for (let i = 0; i < n; i++) {
      cx += pos[i * 3];
      cy += pos[i * 3 + 1];
      cz += pos[i * 3 + 2];
    }
    cx /= n;
    cy /= n;
    cz /= n;

    let maxR2 = 0;
    for (let i = 0; i < n; i++) {
      const dx = pos[i * 3] - cx;
      const dy = pos[i * 3 + 1] - cy;
      const dz = pos[i * 3 + 2] - cz;
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 > maxR2) maxR2 = r2;
    }
    const radius = Math.sqrt(maxR2);

    this.camera.state.target[0] = cx;
    this.camera.state.target[1] = cy;
    this.camera.state.target[2] = cz;
    this.camera.state.distance = radius * 2.5;
  }

  /** Start the render loop (`requestAnimationFrame`). */
  start(): void {
    this.loop.start();
  }

  /** Stop the render loop. */
  stop(): void {
    this.loop.stop();
  }

  /** Stop the loop, release all GPU resources, and remove the canvas. */
  dispose(): void {
    this.loop.stop();
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.beforeFrameCallback = null;
    this.debugOverlay?.dispose();
    this.debugOverlay = null;
    this.picking.dispose();
    this.labelRenderer?.dispose();
    this.edgeRenderer?.dispose();
    this.nodeRenderer?.dispose();
    this.graph.dispose();
    this.canvas.remove();
  }

  /**
   * Updates the device-pixel-ratio cap used when sizing the canvas (see {@link RendererOptions.pixelRatioCap}).
   */
  setPixelRatioCap(cap: number): void {
    const next = Number.isFinite(cap) && cap > 0 ? Math.min(cap, 16) : 2;
    if (next === this.pixelRatioCap) return;
    this.pixelRatioCap = next;
    this.onResize();
  }

  /**
   * Show or hide the debug stats overlay without reconstructing the renderer.
   */
  setShowOverlay(visible: boolean): void {
    if (visible) {
      if (!this.debugOverlay) {
        this.debugOverlay = new DebugOverlay(this.parent, this.gl);
      }
    } else {
      this.debugOverlay?.dispose();
      this.debugOverlay = null;
    }
  }

  private frame = (dt: number, now: number): void => {
    const start = performance.now();
    if (this.overlay) {
      this.overlay.stats.drawCalls = 0;
      this.overlay.stats.nodes = this.graph.nodeCount;
      this.overlay.stats.edges = this.graph.edgeCount;
      this.overlay.stats.gpuMemoryBytes = this.graph.estimateGpuMemory();
    }

    const aspect = this.height > 0 ? this.width / this.height : 1;
    this.camera.update(aspect);

    this.beforeFrameCallback?.(dt);

    const pvPick = this.graph.positionVersion;
    if (pvPick !== this.lastPickPositionVersion) {
      this.lastPickPositionVersion = pvPick;
      const nowL = performance.now();
      // Layout ticks flood invalidateHoverPick → full O(n) picks every frame; throttle keeps FPS sane.
      if (nowL - this.lastLayoutHoverInvalidateAt >= 40) {
        this.lastLayoutHoverInvalidateAt = nowL;
        this.picking.invalidateHoverPick();
      }
    }

    let vpChanged = !this.prevVpPickInitialized;
    const vp = this.camera.viewProjection;
    if (!vpChanged) {
      const prev = this.prevVpForPick;
      for (let i = 0; i < 16; i++) {
        if (vp[i] !== prev[i]) {
          vpChanged = true;
          break;
        }
      }
    }
    if (vpChanged) {
      this.prevVpForPick.set(vp);
      this.prevVpPickInitialized = true;
      this.picking.invalidateHoverPick();
    }

    const gl = this.gl;
    gl.viewport(0, 0, this.width, this.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Rebuild chunk AABBs when positions change
    if (this.graph.positionVersion !== this.lastChunkPositionVersion) {
      this.lastChunkPositionVersion = this.graph.positionVersion;
      this.chunkIndex.buildNodeChunks(
        this.graph.positions,
        this.graph.nodeCount,
      );
      this.chunkIndex.buildEdgeChunks(
        this.graph.edgeIndices,
        this.graph.edgeCount,
        this.graph.positions,
      );
    }

    this.frustum.update(this.camera.viewProjection);

    const nodeMul = clampPresentationScale(this.nodeSizeMultiplier);

    const ncPick = this.graph.nodeCount;
    this.picking.update(
      this.camera,
      {
        positions: this.graph.positions,
        sizes: this.graph.sizes,
        visibility: this.graph.nodeVisibility,
        nodeCount: ncPick,
      },
      this.width,
      this.height,
      this.nodeRenderer?.minScreenSize ?? 2,
      nodeMul,
    );

    // Nodes before edges: billboard depths occlude edge segments that pass “through” discs.
    // (Edges → nodes let thin-line depth beat billboard depth and showed strokes inside spheres.)
    if (this.nodeRenderer && this.graph.nodeCount > 0) {
      const visibleNodeChunks = this.chunkIndex.getVisibleNodeChunks(
        this.frustum,
        this.graph.nodeCount,
        this.nodeChunks,
      );

      if (visibleNodeChunks > 0) {
        this.nodeRenderer.beginDraw(
          this.camera,
          this.height,
          this.picking.hoveredNode ?? -1,
          this.selectionHighlight
            ? (this.picking.selectedNode ?? -1)
            : -1,
          nodeMul,
          clampNodeOpacity(this.nodeOpacity),
        );
        for (let i = 0; i < visibleNodeChunks; i++) {
          const c = this.nodeChunks[i];
          this.nodeRenderer.drawChunk(c.offset, c.count);
        }
        this.nodeRenderer.endDraw();
        if (this.overlay) this.overlay.stats.drawCalls += visibleNodeChunks;
      }
    }

    if (this.edgeRenderer && this.graph.edgeCount > 0) {
      const effectiveEdges = this.lod.getEffectiveEdgeCount(
        this.graph.edgeCount,
      );

      if (effectiveEdges > 0) {
        this.edgeRenderer.updatePositionTexture(
          this.graph.positions,
          this.graph.nodeCount,
          this.graph.positionVersion,
        );

        this.edgeRenderer.maxDist = this.lod.settings.edgeMaxDistance;
        this.edgeRenderer.edgeAlpha = clampEdgeOpacity(this.edgeOpacity);

        const visibleEdgeChunks = this.chunkIndex.getVisibleEdgeChunks(
          this.frustum,
          this.graph.edgeCount,
          this.edgeChunks,
        );

        // Progressive rendering: limit chunk count
        const chunkLimit = this.lod.getProgressiveChunkLimit();
        const chunksThisFrame = Math.min(visibleEdgeChunks, chunkLimit);

        if (chunksThisFrame > 0) {
          this.edgeRenderer.beginDraw(this.camera, this.width, this.height);
          for (let i = 0; i < chunksThisFrame; i++) {
            const c = this.edgeChunks[i];
            this.edgeRenderer.drawEdgeChunk(c.offset, c.count);
          }
          this.edgeRenderer.endDraw();
          if (this.overlay) this.overlay.stats.drawCalls += chunksThisFrame;
        }

        this.lod.advanceProgressive(visibleEdgeChunks);
      }
    }

    // Labels — rebuild when positions, radii, or caps change; billboards + anchor lift use view matrix in the shader.
    if (
      this.labelRenderer &&
      this.labelsVisible &&
      this.graph.labels.length > 0
    ) {
      const pv = this.graph.positionVersion;
      const sv = this.graph.sizeVersion;
      const labelCap = clampVisibleLabelCount(this.maxVisibleLabels);
      const needLabelRebuild =
        pv !== this.lastLabelPositionVersion ||
        sv !== this.lastLabelSizeVersion ||
        labelCap !== this.lastLabelBuildCap;
      if (needLabelRebuild) {
        this.lastLabelPositionVersion = pv;
        this.lastLabelSizeVersion = sv;
        this.lastLabelBuildCap = labelCap;
        const nc = this.graph.nodeCount;
        const nodeVis =
          nc > 0 ? this.graph.nodeVisibility.subarray(0, nc) : undefined;
        const sz =
          nc > 0 ? this.graph.sizes.subarray(0, nc) : new Float32Array(0);
        this.labelRenderer.buildLabels(
          this.graph.positions,
          sz,
          this.graph.labels,
          null,
          labelCap,
          nodeVis,
        );
      }
      // Glyph scale × median radius offsets auto-fit 1/typ shrink (readable text).
      // Disc rim / lift use raw billboard mul so labels align vertically with spheres (degree sizing).
      const ncTyp = this.graph.nodeCount;
      let labelNodeMul = nodeMul;
      if (ncTyp > 0) {
        const typR = typicalStoredRadius(
          this.graph.sizes.subarray(0, ncTyp),
          ncTyp,
        );
        labelNodeMul = clampPresentationScale(nodeMul * typR);
      }
      this.labelRenderer.labelGlyphScale = labelNodeMul;
      this.labelRenderer.discBillboardScale = nodeMul;
      this.labelRenderer.draw(
        this.camera,
        this.height,
        this.nodeRenderer?.minScreenSize ?? this.labelRenderer.minScreenSize,
      );
      if (this.overlay) this.overlay.stats.drawCalls += 1;
    }

    if (this.drawCallback) {
      this.drawCallback(gl, this.camera, dt);
    }

    if (this.overlay) {
      this.overlay.recordFrame(performance.now() - start);
      this.overlay.flush(now);
    }
  };

  private onResize = (): void => {
    const rect = this.parent.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, this.pixelRatioCap);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
  };
}

export type { BackgroundColor } from './backgroundColor';
export {
  normalizeBackgroundColor,
  DEFAULT_BACKGROUND_COLOR,
} from './backgroundColor';
