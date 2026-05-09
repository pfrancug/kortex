/** Live performance statistics exposed by {@link DebugOverlay}. */
export interface DebugStats {
  /** Rolling-average frames per second. */
  fps: number;
  /** 1 % low FPS (worst-case frames). */
  fpsLow1Pct: number;
  /** Average frame time in milliseconds. */
  frameMs: number;
  /** Total WebGL draw calls this frame. */
  drawCalls: number;
  /** Active node count. */
  nodes: number;
  /** Active edge count. */
  edges: number;
  /** Estimated GPU buffer memory in bytes. */
  gpuMemoryBytes: number;
}

const FLUSH_INTERVAL_MS = 250;
const SAMPLE_WINDOW = 60;

const WRAPPER_STYLE = [
  'position: absolute',
  'top: 8px',
  'left: 8px',
  'z-index: 10',
  'display: flex',
  'flex-direction: column',
  'gap: 6px',
  'align-items: stretch',
  // 'max-width: 220px',
].join(';');

const STATS_STYLE = [
  'padding: 8px 10px',
  'background: rgba(0, 0, 0, 0.55)',
  'color: #d8e0e8',
  'font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace',
  'white-space: pre',
  'pointer-events: none',
  'border-radius: 4px',
  'user-select: none',
].join(';');

/** DOM readout for FPS, timing, draw stats, and GPU memory (diagnostics only). */
export class DebugOverlay {
  readonly stats: DebugStats = {
    fps: 0,
    fpsLow1Pct: 0,
    frameMs: 0,
    drawCalls: 0,
    nodes: 0,
    edges: 0,
    gpuMemoryBytes: 0,
  };

  private readonly wrapper: HTMLDivElement;
  private readonly statsEl: HTMLDivElement;
  private readonly samples = new Float32Array(SAMPLE_WINDOW);
  private readonly sortBuf = new Float32Array(SAMPLE_WINDOW);
  private sampleIndex = 0;
  private sampleCount = 0;
  private lastFlush = 0;

  private gpuName = '';

  constructor(parent: HTMLElement, gl?: WebGL2RenderingContext) {
    this.wrapper = document.createElement('div');
    this.wrapper.setAttribute('style', WRAPPER_STYLE);
    parent.appendChild(this.wrapper);

    this.statsEl = document.createElement('div');
    this.statsEl.setAttribute('style', STATS_STYLE);
    this.statsEl.setAttribute('aria-hidden', 'true');
    this.wrapper.appendChild(this.statsEl);

    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        this.gpuName = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
      }
    }

    this.render();
  }

  recordFrame(frameMs: number): void {
    this.samples[this.sampleIndex] = frameMs;
    this.sampleIndex = (this.sampleIndex + 1) % SAMPLE_WINDOW;
    if (this.sampleCount < SAMPLE_WINDOW) this.sampleCount += 1;
  }

  flush(now: number): void {
    if (now - this.lastFlush < FLUSH_INTERVAL_MS) return;
    this.lastFlush = now;
    const n = this.sampleCount;
    if (n === 0) return;

    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += this.samples[i];
      this.sortBuf[i] = this.samples[i];
    }
    const avg = sum / n;
    this.stats.frameMs = avg;
    this.stats.fps = avg > 0 ? 1000 / avg : 0;

    const sorted = this.sortBuf.subarray(0, n).sort();
    const top1Count = Math.max(1, Math.ceil(n * 0.01));
    let slowSum = 0;
    for (let i = n - top1Count; i < n; i++) slowSum += sorted[i];
    const slowAvg = slowSum / top1Count;
    this.stats.fpsLow1Pct = slowAvg > 0 ? 1000 / slowAvg : 0;

    this.render();
  }

  dispose(): void {
    this.wrapper.remove();
  }

  private render(): void {
    const s = this.stats;
    const mem = formatBytes(s.gpuMemoryBytes);
    this.statsEl.textContent =
      `FPS  ${s.fps.toFixed(1)}  (1% low ${s.fpsLow1Pct.toFixed(1)})\n` +
      `MS   ${s.frameMs.toFixed(2)}\n` +
      `DC   ${s.drawCalls}\n` +
      `N    ${s.nodes.toLocaleString()}\n` +
      `E    ${s.edges.toLocaleString()}\n` +
      `MEM  ${mem}` +
      (this.gpuName ? `\nGPU  ${this.gpuName}` : '');
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
