import type { Camera } from './Camera';

/** Tuning knobs for {@link OrbitControls}. */
export interface OrbitConfig {
  /** Mouse-drag rotation sensitivity. */
  rotateSpeed: number;
  /** Mouse-drag pan sensitivity. */
  panSpeed: number;
  /** Scroll-wheel zoom sensitivity. */
  zoomSpeed: number;
  /** Minimum orbit distance (zoom-in limit). */
  minDistance: number;
  /** Maximum orbit distance (zoom-out limit). */
  maxDistance: number;
  /** Minimum elevation in radians (look-up limit). */
  minElevation: number;
  /** Maximum elevation in radians (look-down limit). */
  maxElevation: number;
}

const DEFAULT_CONFIG: OrbitConfig = {
  rotateSpeed: 0.005,
  panSpeed: 0.0025,
  zoomSpeed: 0.1,
  minDistance: 0.5,
  maxDistance: 50_000_000,
  minElevation: -Math.PI / 2 + 0.01,
  maxElevation: Math.PI / 2 - 0.01,
};

type DragMode = 'rotate' | 'pan' | null;

/**
 * Pointer-driven orbit, pan, and zoom controls.
 * Left-drag rotates, right-drag/shift-drag pans, scroll-wheel zooms.
 */
export class OrbitControls {
  private dragging: DragMode = null;
  private lastX = 0;
  private lastY = 0;
  private readonly config: OrbitConfig;

  /** Set to `false` to ignore all pointer and wheel input. */
  enabled = true;

  constructor(
    private readonly element: HTMLElement,
    private readonly camera: Camera,
    config: Partial<OrbitConfig> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.attach();
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('pointermove', this.onPointerMove);
    this.element.removeEventListener('pointerup', this.onPointerUp);
    this.element.removeEventListener('pointercancel', this.onPointerUp);
    this.element.removeEventListener('wheel', this.onWheel);
    this.element.removeEventListener('contextmenu', this.onContextMenu);
  }

  private attach(): void {
    this.element.addEventListener('pointerdown', this.onPointerDown);
    this.element.addEventListener('pointermove', this.onPointerMove);
    this.element.addEventListener('pointerup', this.onPointerUp);
    this.element.addEventListener('pointercancel', this.onPointerUp);
    this.element.addEventListener('wheel', this.onWheel, { passive: false });
    this.element.addEventListener('contextmenu', this.onContextMenu);
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    this.element.setPointerCapture(e.pointerId);
    this.dragging = e.button === 2 || e.shiftKey ? 'pan' : 'rotate';
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    if (this.dragging === 'rotate') this.rotate(dx, dy);
    else this.pan(dx, dy);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.element.hasPointerCapture(e.pointerId)) {
      this.element.releasePointerCapture(e.pointerId);
    }
    this.dragging = null;
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.enabled) return;
    e.preventDefault();
    const factor = Math.exp(Math.sign(e.deltaY) * this.config.zoomSpeed);
    const s = this.camera.state;
    s.distance = clamp(
      s.distance * factor,
      this.config.minDistance,
      this.config.maxDistance,
    );
  };

  private onContextMenu = (e: Event): void => e.preventDefault();

  private rotate(dx: number, dy: number): void {
    const s = this.camera.state;
    s.azimuth -= dx * this.config.rotateSpeed;
    s.elevation = clamp(
      s.elevation + dy * this.config.rotateSpeed,
      this.config.minElevation,
      this.config.maxElevation,
    );
  }

  private pan(dx: number, dy: number): void {
    const s = this.camera.state;
    const scale = s.distance * this.config.panSpeed;
    const cosA = Math.cos(s.azimuth);
    const sinA = Math.sin(s.azimuth);
    const cosE = Math.cos(s.elevation);
    const sinE = Math.sin(s.elevation);
    const rightX = cosA;
    const rightZ = -sinA;
    const upX = -sinA * sinE;
    const upY = cosE;
    const upZ = -cosA * sinE;
    s.target[0] += (-dx * rightX + dy * upX) * scale;
    s.target[1] += dy * upY * scale;
    s.target[2] += (-dx * rightZ + dy * upZ) * scale;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
