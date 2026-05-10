# Nexgraph — package roles & app integration

**Related docs:** [GUIDELINES.md](./GUIDELINES.md) · [DONE.md](./DONE.md) · [TODO.md](./TODO.md) · [../AGENTS.md](../AGENTS.md) · [../README.md](../README.md)

This repo is an npm workspace monorepo. **`@nexgraph/core`** is the engine; **`@nexgraph/demo`** is the vanilla reference app; **`apps/react-demo`** is a **React + Vite** sample; **`@nexgraph/react`** ships **`NexgraphCanvas`** (see below).

---

## `@nexgraph/core`

**Role:** Framework-agnostic **WebGL2** graph visualization and **force-directed layout** for large graphs.

### Rendering & scene

- **`Renderer`** — Owns the canvas, **`GraphStore`** (GPU-backed positions, sizes, colors, edges, labels), orbit **`Camera`** / **`OrbitControls`**, frustum chunking, edges, instanced node billboards, optional SDF **labels**, LOD (**`LODController`**), optional **`DebugOverlay`**.
- **`Camera` / `OrbitControls`** — Left-drag rotates (azimuth / elevation); right-drag or Shift-drag pans by moving the orbit **look-at target** in world space; wheel zooms **distance**. The camera is **not** continuously locked to the graph centroid — use **`fitToData()`** when you want framing centered on the current layout.
- **`fitToData()`** — Sets orbit **target** to the node centroid and **distance** from the bounding radius (no-op if there are zero nodes).
- **`setDrawCallback`** / **`setBeforeFrameCallback`** — Optional hooks for extra draws after the built-in pass and for work between **`Camera.update`** and scene draws (the demo uses **`setBeforeFrameCallback`** for layout smoothing); see **`apps/demo/src/main.ts`**.

### Graph data

- **`GraphStore`** — `setNodes` / `setEdges`, partial **`updatePositions`** / **`updateSizes`**, visibility masks, picking buffers.
- **`parseGraphAsync`** — Worker-based JSON/CSV ingest into **`ParseResult`** (positions, topology, optional weights, layout hints).

### Layout

- **`ForceLayout`** — Runs **`ForceWorker`** (Barnes–Hut-style repulsion + configurable links + cooling **`alpha`**). **`start`** / **`configure`** / **`stop`** / **`dispose`**.
- **`FORCE_LAYOUT_DEFAULTS`**, **`createForceConfigPreset`** (`interoperability` | `stability`), and typed **`ForceConfig`** knobs (theta, link modes, integration order, edge-weight influence, etc.).
- **`suggestedNodeSizeMultiplierFromLayout`**, **`typicalStoredRadius`**, **`axisAlignedExtent`** — Helpers for scaling billboard radii from layout extent + density.

### Interaction

- **`PickingSystem`** — Ray-based hover/select against billboard discs.

### Filters & utilities

- **`applyDegreeWeightFilters`** — Demo-style degree / incident-weight thresholds on visibility.

### Advanced exports

Lower-level pieces (**`NodeRenderer`**, **`EdgeRenderer`**, **`LabelRenderer`**, GL helpers, **`ChunkIndex`**) are exported for custom renderers; treat them as **less stable** than the primary API surface documented in `packages/core/src/index.ts`.

**Dependency shape:** No React. Consumers only need a DOM mount element (or `OffscreenCanvas` patterns if you adapt the renderer glue).

---

## `@nexgraph/demo`

**Role:** **Vite + TypeScript** sandbox that demonstrates **how to wire core** for interactive exploration — not a separate library.

### What it contains

- **`apps/demo/src/main.ts`** — Single entry: constructs **`Renderer`**, **`ForceLayout`**, hooks **`onTick` / `onStabilized`**, loads presets / files / URLs, exports JSON, manages physics fingerprints, dataset position snapshots, **`Reset`**, debounced physics restarts seeded from load positions, graph filters, LOD toggles, optional axes grid (`graphCentroidXYZ` + **`AxesGrid.draw(..., gridOrigin)`**) etc.
- **`apps/demo/src/demo/AxesGrid.ts`** — Reference-only grid/axes helper (**not** exported from **`@nexgraph/core`**): pass **`gridOrigin`** as the graph centroid if you want the floor aligned with the data while the orbit camera moves independently.
- **`apps/demo/src/demo/SettingsPanel.ts`** — HTML/CSS settings UI (not React).
- **`apps/demo/src/demo/generateGraph*.ts`** — Synthetic graphs via worker.
- **`apps/demo/src/demo/exportGraphJson.ts`** — Download graph + positions for round-trips.

### How to run

From repo root:

```bash
npm run dev
# or
npm run dev --workspace=@nexgraph/demo
```

Use the demo as the **canonical reference** when integrating **`@nexgraph/core`** into your own stack.

---

## `@nexgraph/react-demo`

**Role:** Small **Vite + React** app that wires **`@nexgraph/react`** (**`NexgraphCanvas`**) without touching the vanilla demo.

### Run

```bash
npm run dev:react-demo
# or
npm run dev --workspace=@nexgraph/react-demo
```

Dev server defaults to port **5174** (`vite.config.ts`). Sample graph: tetrahedron (**`src/App.tsx`**).

---

## `@nexgraph/react`

**Role:** Thin React layer over **`@nexgraph/core`** — lifecycle-safe **`Renderer`** mounting and declarative **`dataset`** / **`graph`** props.

### Current state (MVP)

- **`NexgraphCanvas`** — Creates **`Renderer`** with `parent` set to an internal full-size `div`; **`dispose()`** on unmount. Forwards **`RendererOptions`** except **`parent`**; after mount, props stay applied (**`edgeOpacity`**, **`nodeSizeMultiplier`**, **`maxVisibleLabels`**, **`pixelRatioCap`**, **`showOverlay`**, **`lod`**). **`contextOptions`** apply only when the WebGL context is created — change them by remounting (React **`key`** on **`NexgraphCanvas`**). **`autoStart`** (default `true`) controls **`renderer.start()`**. Optional **`dataset`** (JSON text or object) is parsed with **`parseGraphAsync`** (`'json'`); topology-only results run **`ForceLayout`** automatically unless **`autoForceLayout`** is false. Typed buffers use **`graph`**. Imperative access via **`onReady(renderer)`**.

Build output: **`npm run build --workspace=@nexgraph/react`** → **`dist/`** (ESM + `.d.ts`). **`peerDependencies`**: **`react`**, **`react-dom`** (^18 / ^19).

### Roadmap

| Piece                              | Purpose                                                                                             |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| **`useCamera`** / **`usePicking`** | Narrow hooks around **`renderer.camera`** / **`renderer.picking`**                                  |
| **`useForceLayout`**               | Wrap **`ForceLayout`**: start/stop from effects; expose running state + callbacks.                  |
| **`apps/react-demo`**              | Shipped minimal **Vite + React** sample — extend with **`ForceLayout`**, file load, etc., as needed |
| **Tests**                          | **`@testing-library/react`** smoke tests                                                            |

Heavy logic stays in **`@nexgraph/core`**.

---

## How implementation in an app looks

Below are two sketches: **vanilla TypeScript** (matches core’s design today) and **React** via **`@nexgraph/react`**.

### 1. Vanilla TypeScript / bundler of choice

Minimal integration steps:

1. **Mount DOM** — Create or select a container `HTMLElement` (full viewport or panel).
2. **Instantiate** — `new Renderer({ parent, nodeSizeMultiplier?, edgeOpacity?, maxVisibleLabels? })`.
3. **Load graph** — Either:
   - **`renderer.graph.setNodes` / `setEdges`** from your data model, or
   - **`parseGraphAsync('json' | 'csv', text)`** then assign results into **`GraphStore`**.
4. **Start loop** — `renderer.start()` (internally `requestAnimationFrame`).
5. **Optional layout** — `new ForceLayout()`, **`start(...)`** with current **`positions`** / **`edgeIndices`** / counts / **`ForceConfig`**, wire **`onTick`** → **`graph.updatePositions`**, **`onStabilized`** → snapshot framing / UI state.
6. **Optional picking** — `renderer.picking.setCallbacks({ onHover, onSelect })`.
7. **Teardown** — `forceLayout.dispose()`, `renderer.dispose()` on route change or unmount.

Pseudo-structure (abbreviated):

```ts
import { Renderer, ForceLayout, parseGraphAsync } from '@nexgraph/core';

const mount = document.getElementById('app')!;
const renderer = new Renderer({ parent: mount });
const layout = new ForceLayout();

layout.onTick = (positions) => {
  renderer.graph.updatePositions(positions);
};
layout.onStabilized = (positions) => {
  renderer.graph.updatePositions(positions);
  renderer.fitToData();
};

async function loadJson(text: string) {
  const r = await parseGraphAsync('json', text);
  if (r.nodeCount > 0)
    renderer.graph.setNodes(r.positions, undefined, undefined, r.labels);
  if (r.edgeCount > 0) renderer.graph.setEdges(r.edgeIndices);
  renderer.fitToData();
}

renderer.start();
```

Your app adds **data fetching**, **auth**, **routing**, and **UI** around this spine — mirroring **`apps/demo/src/main.ts`** for force-layout policy and LOD if you need parity.

### 2. React (`@nexgraph/react`)

```tsx
import { NexgraphCanvas } from '@nexgraph/react';

const graphJson = {
  labels: ['a', 'b'],
  edges: [{ source: 0, target: 1 }],
  nodeCount: 2,
};

function GraphScene() {
  return (
    <NexgraphCanvas
      dataset={graphJson}
      onReady={(r) => r.fitToData()}
      showOverlay={false}
    />
  );
}
```

**Alternatively**, mount **`Renderer`** yourself from **`useEffect`** (same lifecycle **`NexgraphCanvas`** performs internally):

```tsx
import { useEffect, useRef } from 'react';
import { Renderer } from '@nexgraph/core';

export function GraphView() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const renderer = new Renderer({ parent: el });
    renderer.start();

    return () => {
      renderer.dispose();
    };
  }, []);

  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />;
}
```

When **`@nexgraph/react`** grows (narrow hooks, demos, tests), prefer **`NexgraphCanvas`** over duplicating mount boilerplate where props suffice.

### 3. Practical notes

- **Threading:** Parsing and force simulation use **workers**; avoid blocking the main thread with huge synchronous transforms before handing data to **`GraphStore`**.
- **Memory:** Edge/node counts in the millions require LOD (**edge budget**, progressive chunks) — see demo **`LOD`** panel wiring.
- **Layout stopping:** Simulation stops when **`alpha`** cools below **`alphaMin`**, kinetic energy is below the quiet threshold, or **`maxIterations`** is reached (defaults live on **`FORCE_LAYOUT_DEFAULTS`** / **`ForceWorker`**).

---

## Related docs

| Doc                              | Role                                   |
| -------------------------------- | -------------------------------------- |
| [GUIDELINES.md](./GUIDELINES.md) | Architecture & dependency rules        |
| [DONE.md](./DONE.md)             | Completed milestones                   |
| [TODO.md](./TODO.md)             | Active backlog                         |
| [../AGENTS.md](../AGENTS.md)     | AI agent workflow                      |
| `packages/core/src/index.ts`     | Public exports                         |
| **`apps/react-demo/`**           | Vite + React sample (`NexgraphCanvas`) |
| `packages/react/src/`            | **`NexgraphCanvas`**                   |
