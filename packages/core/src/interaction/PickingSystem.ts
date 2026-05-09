import type { Camera } from '../renderer/Camera';
import { pickClosestNodeScreen, pickHoverStable } from './cpuPick';

/** Caps pick iterations/sec during motion / layout thrash (dirty stays set until a pick runs). */
const MIN_PICK_EXEC_MS = 10;

/** Callbacks fired by {@link PickingSystem} on hover/select state changes. */
export interface PickingCallbacks {
  /** Fires when the hovered node changes. `null` = no node under cursor. */
  onHover?: (nodeIndex: number | null) => void;
  /** Fires when the selected node changes (click). `null` = deselected. */
  onSelect?: (nodeIndex: number | null) => void;
}

/** CPU pick reads graph arrays directly — no GPU passes / readPixels. */
export interface PickGraphArrays {
  positions: Float32Array<ArrayBufferLike>;
  sizes: Float32Array<ArrayBufferLike>;
  visibility: Uint8Array<ArrayBufferLike>;
  nodeCount: number;
}

/**
 * Hover/select via CPU screen-space hits matching billboard sizing.
 * Avoids GPU pick redraw + synchronous readPixels, which stalls the pipeline and makes every node appear to hitch together.
 */
export class PickingSystem {
  /** Index of the node currently under the cursor, or `null`. */
  hoveredNode: number | null = null;
  /** Index of the last-clicked node, or `null`. */
  selectedNode: number | null = null;

  private readonly element: HTMLElement;
  private callbacks: PickingCallbacks = {};

  private cursorX = -1;
  private cursorY = -1;
  /** True when cursor moved to a different framebuffer pixel since the last resolved hover. */
  private dirty = false;
  private enabled = true;
  /** Cursor pixel used for the last hover resolve (dedupe sub-pixel jitter). */
  private lastResolvedPickX = -9999;
  private lastResolvedPickY = -9999;

  private latestCamera: Camera | null = null;
  private graphPositions: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private graphSizes: Float32Array<ArrayBufferLike> = new Float32Array(0);
  private graphVisibility: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  private graphNodeCount = 0;
  private minScreenSize = 2;
  private lastPickExecAt = 0;
  /** Latest scale from {@link Renderer} — used for click picks when `update` skipped a frame. */
  private lastNodeSizeMul = 1;

  /** CSS-pointer → framebuffer px (`canvas.width/height`), matching Renderer resize logic. */
  private pointerToFramebufferPx(clientX: number, clientY: number): void {
    const canvas = this.element as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const fw = canvas.width;
    const fh = canvas.height;
    if (
      fw < 1 ||
      fh < 1 ||
      !Number.isFinite(rect.width) ||
      rect.width < 1e-6 ||
      !Number.isFinite(rect.height) ||
      rect.height < 1e-6
    ) {
      this.cursorX = -1;
      this.cursorY = -1;
      return;
    }
    const sx = fw / rect.width;
    const sy = fh / rect.height;
    const x = (clientX - rect.left) * sx;
    const y = (clientY - rect.top) * sy;
    this.cursorX = Math.max(0, Math.min(fw - 1, Math.floor(x)));
    this.cursorY = Math.max(0, Math.min(fh - 1, Math.floor(y)));
  }

  constructor(element: HTMLElement, callbacks?: PickingCallbacks) {
    this.element = element;
    if (callbacks) this.callbacks = callbacks;
    this.attach();
  }

  setCallbacks(cb: PickingCallbacks): void {
    this.callbacks = cb;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on && this.hoveredNode !== null) {
      this.hoveredNode = null;
      this.callbacks.onHover?.(null);
    }
  }

  /**
   * Marks hover resolve stale — call when world/view projection changes without pointer motion
   * (layout ticks, camera orbit/zoom, resize).
   */
  invalidateHoverPick(): void {
    if (this.enabled && this.cursorX >= 0 && this.cursorY >= 0) {
      this.dirty = true;
    }
  }

  /**
   * Called once per frame from the render loop after matrices are updated.
   */
  update(
    camera: Camera,
    graph: PickGraphArrays,
    viewportWidth: number,
    viewportHeight: number,
    nodeMinScreenSize: number,
    nodeSizeMultiplier: number,
  ): void {
    this.latestCamera = camera;
    this.graphPositions = graph.positions;
    this.graphSizes = graph.sizes;
    this.graphVisibility = graph.visibility;
    this.graphNodeCount = graph.nodeCount;
    this.minScreenSize = nodeMinScreenSize;
    this.lastNodeSizeMul = nodeSizeMultiplier;

    if (!this.enabled || !this.dirty) return;

    const x = this.cursorX;
    const y = this.cursorY;

    if (
      x < 0 ||
      y < 0 ||
      x >= viewportWidth ||
      y >= viewportHeight ||
      this.graphNodeCount <= 0
    ) {
      this.dirty = false;
      this.lastResolvedPickX = x;
      this.lastResolvedPickY = y;
      if (this.hoveredNode !== null) {
        this.hoveredNode = null;
        this.callbacks.onHover?.(null);
      }
      return;
    }

    const nowPick = performance.now();
    if (nowPick - this.lastPickExecAt < MIN_PICK_EXEC_MS) return;
    this.lastPickExecAt = nowPick;

    this.dirty = false;
    this.lastResolvedPickX = x;
    this.lastResolvedPickY = y;

    const sel = this.selectedNode ?? -1;
    const pickParams = {
      view: camera.view,
      proj: camera.projection,
      eyeX: camera.position[0],
      eyeY: camera.position[1],
      eyeZ: camera.position[2],
      positions: this.graphPositions,
      sizes: this.graphSizes,
      visibility: this.graphVisibility,
      nodeCount: this.graphNodeCount,
      selectedIndex: sel,
      cursorFbX: x,
      cursorFbY: y,
      viewportWidth,
      viewportHeight,
      minScreenSize: this.minScreenSize,
      nodeSizeMultiplier: nodeSizeMultiplier,
    };
    const prevHover = this.hoveredNode;
    const hit = pickHoverStable(pickParams, prevHover);

    const newHover = hit >= 0 ? hit : null;
    if (newHover !== this.hoveredNode) {
      this.hoveredNode = newHover;
      this.callbacks.onHover?.(newHover);
    }
  }

  dispose(): void {
    this.element.removeEventListener('pointermove', this.onPointerMove);
    this.element.removeEventListener('pointerleave', this.onPointerLeave);
    this.element.removeEventListener('click', this.onClick);
  }

  private attach(): void {
    this.element.addEventListener('pointermove', this.onPointerMove, {
      passive: true,
    });
    this.element.addEventListener('pointerleave', this.onPointerLeave);
    this.element.addEventListener('click', this.onClick);
  }

  private onPointerMove = (e: PointerEvent): void => {
    this.pointerToFramebufferPx(e.clientX, e.clientY);
    if (
      this.cursorX !== this.lastResolvedPickX ||
      this.cursorY !== this.lastResolvedPickY
    ) {
      this.dirty = true;
    }
  };

  private onPointerLeave = (): void => {
    this.cursorX = -1;
    this.cursorY = -1;
    this.dirty = false;
    this.lastResolvedPickX = -9999;
    this.lastResolvedPickY = -9999;
    if (this.hoveredNode !== null) {
      this.hoveredNode = null;
      this.callbacks.onHover?.(null);
    }
  };

  private onClick = (): void => {
    let hoverForClick = this.hoveredNode;

    const cam = this.latestCamera;
    const nc = this.graphNodeCount;
    const vw = (this.element as HTMLCanvasElement).width;
    const vh = (this.element as HTMLCanvasElement).height;
    const x = this.cursorX;
    const y = this.cursorY;

    if (
      this.enabled &&
      cam !== null &&
      nc > 0 &&
      x >= 0 &&
      y >= 0 &&
      x < vw &&
      y < vh
    ) {
      const sel = this.selectedNode ?? -1;
      const hit = pickClosestNodeScreen({
        view: cam.view,
        proj: cam.projection,
        eyeX: cam.position[0],
        eyeY: cam.position[1],
        eyeZ: cam.position[2],
        positions: this.graphPositions,
        sizes: this.graphSizes,
        visibility: this.graphVisibility,
        nodeCount: nc,
        selectedIndex: sel,
        cursorFbX: x,
        cursorFbY: y,
        viewportWidth: vw,
        viewportHeight: vh,
        minScreenSize: this.minScreenSize,
        nodeSizeMultiplier: this.lastNodeSizeMul,
      });
      hoverForClick = hit >= 0 ? hit : null;
      if (hoverForClick !== this.hoveredNode) {
        this.hoveredNode = hoverForClick;
        this.callbacks.onHover?.(hoverForClick);
      }
      this.lastResolvedPickX = x;
      this.lastResolvedPickY = y;
      this.dirty = false;
    }

    const prev = this.selectedNode;
    this.selectedNode = hoverForClick;
    if (this.selectedNode !== prev) {
      this.callbacks.onSelect?.(this.selectedNode);
    }
  };
}
