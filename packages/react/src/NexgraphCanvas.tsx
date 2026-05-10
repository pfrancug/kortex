import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react';
import {
  Renderer,
  clampPresentationScale,
  clampEdgeOpacity,
  clampNodeOpacity,
  clampVisibleLabelCount,
  MAX_VISIBLE_LABELS_UNLIMITED,
  ForceLayout,
  createForceConfigPreset,
  parseGraphAsync,
  type ForceLayoutPresetId,
  type GraphJsonDocument,
  type GraphStore,
  type ParseResult,
  type RendererOptions,
} from '@nexgraph/core';

/** RGB triple **0–255** returned by {@link NexgraphNodeColorFn} / {@link NexgraphEdgeColorFn}; alpha is filled as **255** on the GPU (use **`nodeOpacity`** / **`edgeOpacity`**). */
export type NexgraphRgb = readonly [number, number, number];

/** Context for {@link NexgraphNodeColorFn} (aligned with ForceGraph **`nodeColor`**). */
export type NexgraphNodeColorContext = {
  nodeIndex: number;
  /** From {@link GraphStore.labels} when that entry exists. */
  label?: string;
  /** `nodeColorData[nodeIndex]` when {@link NexgraphCanvasProps.nodeColorData} is long enough. */
  data?: unknown;
};

/** Same shape as {@link NexgraphNodeColorContext} — passed to **`onNodeClick`**; **`null`** means background click. */
export type NexgraphNodeClickContext = NexgraphNodeColorContext;

/** Imperative API (e.g. **`zoomToFit`** like steam-group-joiner **`ForceGraph`** ref). */
export interface NexgraphCanvasHandle {
  /** Fits orbit camera to current node bounds ({@link Renderer.fitToData}). */
  zoomToFit: () => void;
  /** Sets orbit distance from target (preserves azimuth / elevation). */
  setZoomDistance: (distance: number) => void;
  getZoomDistance: () => number;
  /**
   * Live node position buffer from the renderer (**`nodeCount × 3`** floats, xyz…).
   * Do not mutate; **`null`** before mount / after dispose.
   */
  getGraphPositions: () => Float32Array | null;
}

const MIN_ORBIT_DISTANCE = 0.5;
const MAX_ORBIT_DISTANCE = 50_000_000;

/** Match {@link OrbitControls} default clamp range. */
export function clampOrbitDistance(distance: number): number {
  if (!Number.isFinite(distance)) return MIN_ORBIT_DISTANCE;
  return Math.min(
    MAX_ORBIT_DISTANCE,
    Math.max(MIN_ORBIT_DISTANCE, distance),
  );
}

/** Default auto-rotate angular speed (rad/s), ~4.6°/s. */
export const DEFAULT_AUTO_ROTATE_SPEED = 0.08;

/** Per-node tint callback; closure can carry selection / search state like **`react-force-graph`** **`nodeColor`**. */
export type NexgraphNodeColorFn = (ctx: NexgraphNodeColorContext) => NexgraphRgb;

/** Context for {@link NexgraphEdgeColorFn} (aligned with ForceGraph **`linkColor`**). */
export type NexgraphEdgeColorContext = {
  edgeIndex: number;
  sourceIndex: number;
  targetIndex: number;
  /** `edgeColorData[edgeIndex]` when {@link NexgraphCanvasProps.edgeColorData} is long enough. */
  data?: unknown;
};

/** Per-edge tint callback; closure can carry selection / match state like **`linkColor`**. */
export type NexgraphEdgeColorFn = (ctx: NexgraphEdgeColorContext) => NexgraphRgb;

function applyNexgraphNodeColors(
  graph: GraphStore,
  nodeColors: Uint8Array | null | undefined,
  nodeColorFn: NexgraphNodeColorFn | undefined,
  nodeColorData: readonly unknown[] | undefined,
): void {
  const n = graph.nodeCount;
  if (n <= 0) return;

  if (
    nodeColors !== undefined &&
    nodeColors !== null &&
    nodeColors.length >= n * 4
  ) {
    graph.updateColors(nodeColors.subarray(0, n * 4));
    return;
  }

  if (nodeColorFn) {
    const labels = graph.labels;
    const buf = new Uint8Array(n * 4);
    const dataArr = nodeColorData;
    const hasData = dataArr !== undefined && dataArr.length >= n;
    for (let i = 0; i < n; i++) {
      const c = nodeColorFn({
        nodeIndex: i,
        label: labels[i],
        data: hasData ? dataArr[i] : undefined,
      });
      const o = i * 4;
      buf[o] = c[0];
      buf[o + 1] = c[1];
      buf[o + 2] = c[2];
      buf[o + 3] = 255;
    }
    graph.updateColors(buf);
  }
}

function applyNexgraphEdgeColors(
  graph: GraphStore,
  edgeColors: Uint8Array | null | undefined,
  edgeColorFn: NexgraphEdgeColorFn | undefined,
  edgeColorData: readonly unknown[] | undefined,
): void {
  const e = graph.edgeCount;
  if (e <= 0) return;

  if (
    edgeColors !== undefined &&
    edgeColors !== null &&
    edgeColors.length >= e * 4
  ) {
    graph.updateEdgeColors(edgeColors.subarray(0, e * 4));
    return;
  }

  if (edgeColorFn) {
    const idx = graph.edgeIndices;
    const buf = new Uint8Array(e * 4);
    const dataArr = edgeColorData;
    const hasData = dataArr !== undefined && dataArr.length >= e;
    for (let i = 0; i < e; i++) {
      const c = edgeColorFn({
        edgeIndex: i,
        sourceIndex: idx[i * 2]!,
        targetIndex: idx[i * 2 + 1]!,
        data: hasData ? dataArr[i] : undefined,
      });
      const o = i * 4;
      buf[o] = c[0];
      buf[o + 1] = c[1];
      buf[o + 2] = c[2];
      buf[o + 3] = 255;
    }
    graph.updateEdgeColors(buf);
  }
}

/** JSON object passed to {@link parseGraphAsync} (`'json'`), or pre-serialized UTF-8 text. */
export type NexgraphCanvasDataset = GraphJsonDocument | string;

/** Input text for {@link parseGraphAsync} in JSON mode, or `null` to skip loading. */
function datasetPayloadForWorker(
  dataset: NexgraphCanvasDataset | null | undefined,
): string | null {
  if (dataset === undefined || dataset === null) return null;
  if (typeof dataset === 'string') {
    return dataset.trim() === '' ? null : dataset;
  }
  try {
    return JSON.stringify(dataset);
  } catch {
    return null;
  }
}

/**
 * Optional graph payload applied whenever these references change (identity counts — reuse stable buffers).
 * Omit when using **`dataset`** only.
 */
export type NexgraphCanvasGraphProps = {
  positions: Float32Array;
  colors?: Uint8Array;
  sizes?: Float32Array;
  labels?: string[];
  edges: Uint32Array;
  edgeColors?: Uint8Array;
  /**
   * Per-edge scalar weights (**length ≥ edge pair count**) for {@link ForceLayout}
   * when **`graphForceLayout`** is enabled (same order as **`edges`** pairs).
   */
  edgeWeights?: Float32Array;
};

export type NexgraphCanvasProps = Omit<RendererOptions, 'parent'> & {
  className?: string;
  style?: CSSProperties;
  /**
   * Start the render loop on mount.
   * @defaultValue true
   */
  autoStart?: boolean;
  /**
   * Called once after {@link Renderer} is constructed (after {@link Renderer.start}
   * when `autoStart` is true).
   */
  onReady?: (renderer: Renderer) => void;
  /**
   * JSON graph as a {@link GraphJsonDocument} or **UTF-8 text** for {@link parseGraphAsync} (`'json'` only).
   * Objects are serialized with `JSON.stringify` (fine for small graphs; prefer a **string** from `file.text()`
   * or `fetch().then(r => r.text())` for large files).
   * When set, **`graph`** is ignored.
   */
  dataset?: NexgraphCanvasDataset | null;
  /**
   * When **`dataset`** parses with **`layoutSuggested`**, start {@link ForceLayout} automatically.
   * @defaultValue true
   */
  autoForceLayout?: boolean;
  /**
   * Passed to {@link createForceConfigPreset} when **`autoForceLayout`** runs.
   * @defaultValue 'interoperability'
   */
  forceLayoutPreset?: ForceLayoutPresetId;
  /**
   * Called after **`dataset`** parses successfully (typed arrays are already uploaded).
   */
  onDatasetLoaded?: (result: ParseResult) => void;
  /**
   * Called when **`dataset`** parsing fails.
   */
  onDatasetError?: (error: Error) => void;
  /**
   * Declarative graph: applied after mount and whenever buffer references change.
   * Ignored while **`dataset`** is set.
   */
  graph?: NexgraphCanvasGraphProps | null;
  /**
   * When **`true`** and **`graph`** is applied with at least one edge, run {@link ForceLayout}
   * after upload (same worker path as topology-only **`dataset`** loads).
   * Ignored while **`dataset`** is set.
   * @defaultValue false
   */
  graphForceLayout?: boolean;
  /**
   * Called after each physics tick / stabilize while **`graphForceLayout`** is driving layout
   * (after positions are written to the GPU store). Optional — use to snapshot **`positions`**
   * for persistence across **`graph`** updates.
   */
  onGraphLayoutTick?: (positions: Float32Array) => void;
  /**
   * After applying **`dataset`** or **`graph`**, call {@link Renderer.fitToData}.
   * @defaultValue true when **`dataset`** or **`graph`** is set.
   * Independent of **`zoomDistance`** (that prop still sets orbit distance when provided).
   */
  fitGraph?: boolean;
  /**
   * Packed RGBA per node (**`nodeCount × 4`** bytes). Overrides colors from **`dataset`** / **`graph`** when length suffices.
   * Buffer alpha is multiplied with **`nodeOpacity`** in the shader (per-node fade). Prefer **`nodeColor`** plus **`nodeOpacity`** when you only need RGB tints and one global transparency.
   */
  nodeColors?: Uint8Array | null;
  /**
   * Per-node RGB (**0–255**); alpha is always **255** (use **`nodeOpacity`** for transparency).
   * Receives {@link NexgraphNodeColorContext} — same idea as ForceGraph **`nodeColor`**, with optional **`nodeColorData`** for domain rows (e.g. joiner **`GraphNode`** in export order).
   * Ignored when **`nodeColors`** covers all nodes.
   */
  nodeColor?: NexgraphNodeColorFn;
  /**
   * Parallel to node index (**length ≥ node count**); passed as **`ctx.data`** to **`nodeColor`**.
   * Use the same row order as **`dataset`** / **`graph`** nodes (e.g. the source **`nodes`** array you serialized into JSON).
   */
  nodeColorData?: readonly unknown[];
  /**
   * Bump when **`nodeColor`** should re-run but its reference is unchanged (e.g. selection or search).
   * @defaultValue 0
   */
  nodeColorRevision?: number;
  /**
   * Packed RGBA per edge (**`edgeCount × 4`** bytes), same order as **`graph.edges`** / **`dataset`** pairs.
   * Buffer alpha is multiplied with **`edgeOpacity`** in the shader (per-edge fade). Prefer **`linkColor`** plus **`edgeOpacity`** when you only need RGB tints and one global transparency.
   */
  edgeColors?: Uint8Array | null;
  /**
   * Per-edge RGB (**0–255**); alpha is always **255** (use **`edgeOpacity`** for transparency).
   * Receives {@link NexgraphEdgeColorContext} (**`sourceIndex`** / **`targetIndex`** are **`GraphStore`** node indices) — same idea as ForceGraph **`linkColor`**.
   * Optional **`edgeColorData`** passes one payload per edge (same order as **`graph.edges`** pairs / **`dataset`** **`edges`**).
   * Ignored when **`edgeColors`** covers all edges.
   */
  linkColor?: NexgraphEdgeColorFn;
  /**
   * Parallel to edge index (**length ≥ edge count**); passed as **`ctx.data`** to **`linkColor`**.
   */
  edgeColorData?: readonly unknown[];
  /**
   * Bump when **`linkColor`** should re-run but its reference is unchanged.
   * @defaultValue 0
   */
  edgeColorRevision?: number;
  /**
   * Called when the user clicks a node (**context**) or empty canvas (**`null`**).
   * When set, hovered nodes use **`cursor: pointer`**. Omit to disable click handling;
   * hover label tooltip still runs when **`renderer`** is mounted.
   */
  onNodeClick?: (node: NexgraphNodeClickContext | null) => void;
  /**
   * Orbit camera distance from target (clamped). Omitted when **`undefined`** — distance follows user navigation only.
   */
  zoomDistance?: number;
  /**
   * Slowly orbit the camera around **`target`** (adjusts azimuth each frame).
   * @defaultValue false
   */
  autoRotate?: boolean;
  /** Auto-rotate speed in **radians per second**. @defaultValue {@link DEFAULT_AUTO_ROTATE_SPEED} */
  autoRotateSpeed?: number;
  /**
   * When **`false`**, pointer orbit / pan / zoom are disabled (canvas still paints).
   * @defaultValue true
   */
  enableNavigationControls?: boolean;
  /**
   * Bump when **`onNodeClick`** should see fresh **`nodeColorData`** but its reference is unchanged.
   * @defaultValue 0
   */
  nodeInteractionRevision?: number;
};

/**
 * Mounts a {@link Renderer} into a container `div` (full-size canvas).
 * Dispose runs on unmount.
 *
 * Props mirror {@link RendererOptions} (except **`parent`**, which is internal). All options except
 * **`contextOptions`** stay in sync after mount — **`contextOptions`** only apply when the WebGL context is
 * created; to change them, remount (e.g. put a React **`key`** on **`NexgraphCanvas`**).
 *
 * Pass **`dataset`** as JSON **text** (e.g. `.json` file contents) or a **serializable graph object**
 * ({@link parseGraphAsync}, JSON only). For typed GPU buffers, use **`graph`** instead (ignored while **`dataset`** is set).
 * Topology-only JSON yields **`layoutSuggested`** — {@link ForceLayout} starts automatically unless **`autoForceLayout`** is false.
 * With **`graph`** only, set **`graphForceLayout`** to run the same simulation after buffer upload (optional **`graph.edgeWeights`**).
 * Use **`onReady`** when you need the {@link Renderer} instance (picking, custom loops, etc.).
 * Optional **`nodeColors`** / **`nodeColor`** / **`nodeColorData`** / **`nodeColorRevision`** drive per-node tint after load; **`edgeColors`** / **`linkColor`** / **`edgeColorData`** / **`edgeColorRevision`** do the same for edges (callbacks mirror ForceGraph **`nodeColor`** / **`linkColor`**). Transparency uses **`nodeOpacity`** / **`edgeOpacity`** (global).
 */
export const NexgraphCanvas = forwardRef<NexgraphCanvasHandle, NexgraphCanvasProps>(
  function NexgraphCanvas(props, ref): ReactElement {
  const {
    className,
    style,
    autoStart = true,
    onReady,
    graph,
    graphForceLayout = false,
    onGraphLayoutTick,
    fitGraph,
    dataset,
    onDatasetLoaded,
    onDatasetError,
    autoForceLayout,
    forceLayoutPreset,
    nodeColors,
    nodeColor,
    nodeColorData,
    nodeColorRevision = 0,
    edgeColors,
    linkColor,
    edgeColorData,
    edgeColorRevision = 0,
    pixelRatioCap,
    contextOptions,
    showOverlay,
    lod,
    nodeSizeMultiplier,
    maxVisibleLabels,
    edgeOpacity,
    nodeOpacity,
    backgroundColor,
    onNodeClick,
    zoomDistance,
    autoRotate = false,
    autoRotateSpeed = DEFAULT_AUTO_ROTATE_SPEED,
    enableNavigationControls = true,
    nodeInteractionRevision = 0,
    selectionHighlight = false,
  } = props;

  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [renderer, setRenderer] = useState<Renderer | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const onDatasetLoadedRef = useRef(onDatasetLoaded);
  onDatasetLoadedRef.current = onDatasetLoaded;
  const onDatasetErrorRef = useRef(onDatasetError);
  onDatasetErrorRef.current = onDatasetError;

  const onNodeClickRef = useRef(onNodeClick);
  onNodeClickRef.current = onNodeClick;

  const onGraphLayoutTickRef = useRef(onGraphLayoutTick);
  onGraphLayoutTickRef.current = onGraphLayoutTick;

  const [hoverTip, setHoverTip] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const pointerClientRef = useRef({ x: 0, y: 0 });

  const nodeColorsRef = useRef(nodeColors);
  nodeColorsRef.current = nodeColors;
  const nodeColorFnRef = useRef(nodeColor);
  nodeColorFnRef.current = nodeColor;
  const nodeColorDataRef = useRef(nodeColorData);
  nodeColorDataRef.current = nodeColorData;

  const edgeColorsRef = useRef(edgeColors);
  edgeColorsRef.current = edgeColors;
  const edgeColorFnRef = useRef(linkColor);
  edgeColorFnRef.current = linkColor;
  const edgeColorDataRef = useRef(edgeColorData);
  edgeColorDataRef.current = edgeColorData;

  const layoutOptsRef = useRef({
    auto: true as boolean,
    preset: 'interoperability' as ForceLayoutPresetId,
  });
  layoutOptsRef.current = {
    auto: autoForceLayout !== false,
    preset: forceLayoutPreset ?? 'interoperability',
  };

  const datasetPayload = datasetPayloadForWorker(dataset);
  const forceLayoutRef = useRef<ForceLayout | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const forceLayout = new ForceLayout();
    forceLayoutRef.current = forceLayout;

    const r = new Renderer({
      parent: el,
      pixelRatioCap,
      contextOptions,
      showOverlay,
      lod,
      nodeSizeMultiplier,
      maxVisibleLabels,
      edgeOpacity,
      nodeOpacity,
      backgroundColor,
      selectionHighlight,
    });

    forceLayout.onTick = (positions) => {
      r.graph.updatePositions(positions);
      onGraphLayoutTickRef.current?.(positions);
    };
    forceLayout.onStabilized = (positions) => {
      r.graph.updatePositions(positions);
      onGraphLayoutTickRef.current?.(positions);
      // Do not call fitToData here — auto force layout must not move zoom / orbit target.
    };

    setRenderer(r);
    if (autoStart) r.start();
    onReadyRef.current?.(r);

    return () => {
      forceLayout.dispose();
      forceLayoutRef.current = null;
      setRenderer(null);
      r.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount snapshot; contextOptions fixed until remount.
  }, []);

  useEffect(() => {
    if (!renderer) return;
    renderer.edgeOpacity = clampEdgeOpacity(edgeOpacity ?? 1);
    renderer.nodeOpacity = clampNodeOpacity(nodeOpacity ?? 1);
    renderer.backgroundColor = backgroundColor;
    renderer.nodeSizeMultiplier = clampPresentationScale(
      nodeSizeMultiplier ?? 1,
    );
    renderer.maxVisibleLabels = clampVisibleLabelCount(
      maxVisibleLabels ?? MAX_VISIBLE_LABELS_UNLIMITED,
    );
    renderer.setPixelRatioCap(pixelRatioCap ?? 2);
    renderer.setShowOverlay(showOverlay === true);
    renderer.lod.applySettings(lod);
    renderer.controls.enabled = enableNavigationControls !== false;
    renderer.selectionHighlight = selectionHighlight;
  }, [
    renderer,
    edgeOpacity,
    nodeOpacity,
    backgroundColor,
    nodeSizeMultiplier,
    maxVisibleLabels,
    pixelRatioCap,
    showOverlay,
    lod,
    enableNavigationControls,
    selectionHighlight,
  ]);

  useEffect(() => {
    rendererRef.current = renderer;
  }, [renderer]);

  useEffect(() => {
    if (!renderer || zoomDistance === undefined) return;
    renderer.camera.state.distance = clampOrbitDistance(zoomDistance);
  }, [renderer, zoomDistance]);

  useEffect(() => {
    if (!renderer || !autoRotate) return;
    let raf = 0;
    let last = performance.now();
    const speed =
      typeof autoRotateSpeed === 'number' && Number.isFinite(autoRotateSpeed)
        ? autoRotateSpeed
        : DEFAULT_AUTO_ROTATE_SPEED;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      renderer.camera.state.azimuth -= speed * dt;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [renderer, autoRotate, autoRotateSpeed]);

  useImperativeHandle(
    ref,
    () => ({
      zoomToFit: () => {
        rendererRef.current?.fitToData();
      },
      setZoomDistance: (distance: number) => {
        const r = rendererRef.current;
        if (!r) return;
        r.camera.state.distance = clampOrbitDistance(distance);
      },
      getZoomDistance: () => rendererRef.current?.camera.state.distance ?? 0,
      getGraphPositions: () => rendererRef.current?.graph.positions ?? null,
    }),
    [],
  );

  useEffect(() => {
    if (!renderer) return;
    const canvas = renderer.canvas;
    const graph = renderer.graph;

    const move = (e: PointerEvent) => {
      pointerClientRef.current = { x: e.clientX, y: e.clientY };
    };
    canvas.addEventListener('pointermove', move);

    const clickCtx = (idx: number | null): NexgraphNodeClickContext | null => {
      if (idx === null) return null;
      const n = graph.nodeCount;
      const dataArr = nodeColorDataRef.current;
      const hasData = dataArr !== undefined && dataArr.length >= n;
      return {
        nodeIndex: idx,
        label: graph.labels[idx],
        data: hasData ? dataArr[idx] : undefined,
      };
    };

    renderer.picking.setCallbacks({
      onHover: (idx) => {
        canvas.style.cursor =
          idx !== null && onNodeClickRef.current ? 'pointer' : 'default';
        const { x, y } = pointerClientRef.current;
        if (idx === null) {
          setHoverTip(null);
          return;
        }
        const lab = graph.labels[idx];
        if (typeof lab === 'string' && lab.trim() !== '') {
          setHoverTip({ text: lab, x, y });
        } else {
          setHoverTip(null);
        }
      },
      onSelect: (idx) => {
        onNodeClickRef.current?.(clickCtx(idx));
      },
    });

    return () => {
      canvas.removeEventListener('pointermove', move);
      renderer.picking.setCallbacks({});
      canvas.style.cursor = '';
      setHoverTip(null);
    };
  }, [renderer, nodeInteractionRevision]);

  const shouldFitAfterLoad = fitGraph !== undefined ? fitGraph : true;

  useEffect(() => {
    if (!renderer || datasetPayload !== null) return;
    if (graph === undefined || graph === null) {
      forceLayoutRef.current?.stop();
      return;
    }
    forceLayoutRef.current?.stop();
    const g = graph;
    renderer.graph.setNodes(g.positions, g.colors, g.sizes, g.labels);
    renderer.graph.setEdges(g.edges, g.edgeColors);
    applyNexgraphNodeColors(
      renderer.graph,
      nodeColorsRef.current,
      nodeColorFnRef.current,
      nodeColorDataRef.current,
    );
    applyNexgraphEdgeColors(
      renderer.graph,
      edgeColorsRef.current,
      edgeColorFnRef.current,
      edgeColorDataRef.current,
    );
    if (shouldFitAfterLoad) renderer.fitToData();

    const runGraphPhysics =
      graphForceLayout &&
      renderer.graph.edgeCount > 0 &&
      renderer.graph.nodeCount > 0;
    if (runGraphPhysics) {
      const weights =
        g.edgeWeights && g.edgeWeights.length >= renderer.graph.edgeCount
          ? g.edgeWeights
          : undefined;
      const preset = layoutOptsRef.current.preset;
      forceLayoutRef.current?.start(
        renderer.graph.positions,
        renderer.graph.edgeIndices,
        renderer.graph.nodeCount,
        renderer.graph.edgeCount,
        createForceConfigPreset(preset),
        weights,
      );
    }
  }, [
    renderer,
    datasetPayload,
    graph?.positions,
    graph?.edges,
    graph?.colors,
    graph?.sizes,
    graph?.labels,
    graph?.edgeColors,
    graph?.edgeWeights,
    graphForceLayout,
    forceLayoutPreset,
    fitGraph,
  ]);

  useEffect(() => {
    if (!renderer) return;

    if (datasetPayload === null) {
      return;
    }

    forceLayoutRef.current?.stop();

    let cancelled = false;
    const fitAfterThisDatasetLoad = fitGraph !== undefined ? fitGraph : true;

    void (async () => {
      try {
        const result = await parseGraphAsync('json', datasetPayload);
        if (cancelled) return;

        if (result.nodeCount > 0) {
          renderer.graph.setNodes(
            result.positions,
            result.colors,
            result.sizes,
            result.labels,
          );
        }
        if (result.edgeCount > 0) {
          renderer.graph.setEdges(result.edgeIndices);
        }

        onDatasetLoadedRef.current?.(result);

        const opts = layoutOptsRef.current;
        const runAutoLayout =
          opts.auto &&
          result.layoutSuggested === true &&
          result.nodeCount > 0 &&
          result.edgeCount > 0;

        if (runAutoLayout) {
          const weights =
            result.edgeWeights &&
            result.edgeWeights.length >= result.edgeCount
              ? result.edgeWeights
              : undefined;
          forceLayoutRef.current?.start(
            renderer.graph.positions,
            renderer.graph.edgeIndices,
            renderer.graph.nodeCount,
            renderer.graph.edgeCount,
            createForceConfigPreset(opts.preset),
            weights,
          );
        } else {
          forceLayoutRef.current?.stop();
          if (fitAfterThisDatasetLoad) renderer.fitToData();
        }

        applyNexgraphNodeColors(
          renderer.graph,
          nodeColorsRef.current,
          nodeColorFnRef.current,
          nodeColorDataRef.current,
        );
        applyNexgraphEdgeColors(
          renderer.graph,
          edgeColorsRef.current,
          edgeColorFnRef.current,
          edgeColorDataRef.current,
        );
      } catch (err) {
        if (cancelled) return;
        forceLayoutRef.current?.stop();
        const error = err instanceof Error ? err : new Error(String(err));
        onDatasetErrorRef.current?.(error);
      }
    })();

    return () => {
      cancelled = true;
      forceLayoutRef.current?.stop();
    };
  }, [renderer, datasetPayload, fitGraph]);

  useEffect(() => {
    if (!renderer || renderer.graph.nodeCount === 0) return;
    applyNexgraphNodeColors(
      renderer.graph,
      nodeColorsRef.current,
      nodeColorFnRef.current,
      nodeColorDataRef.current,
    );
  }, [
    renderer,
    nodeColorRevision,
    nodeColors,
    nodeColor,
    nodeColorData,
    datasetPayload,
    graph?.positions,
    graph?.edges,
  ]);

  useEffect(() => {
    if (!renderer || renderer.graph.edgeCount === 0) return;
    applyNexgraphEdgeColors(
      renderer.graph,
      edgeColorsRef.current,
      edgeColorFnRef.current,
      edgeColorDataRef.current,
    );
  }, [
    renderer,
    edgeColorRevision,
    edgeColors,
    linkColor,
    edgeColorData,
    datasetPayload,
    graph?.positions,
    graph?.edges,
  ]);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        ...style,
      }}
    >
      {hoverTip ? (
        <div
          role='tooltip'
          style={{
            position: 'fixed',
            left: hoverTip.x + 14,
            top: hoverTip.y + 14,
            zIndex: 100,
            pointerEvents: 'none',
            maxWidth: 280,
            padding: '6px 10px',
            borderRadius: 6,
            fontSize: 12,
            lineHeight: 1.35,
            background: 'rgba(15, 18, 23, 0.92)',
            color: '#e4e4e8',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
          }}
        >
          {hoverTip.text}
        </div>
      ) : null}
    </div>
  );
});

NexgraphCanvas.displayName = 'NexgraphCanvas';
