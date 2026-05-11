# @nexgraph/core

[![npm version](https://img.shields.io/npm/v/@nexgraph/core.svg)](https://www.npmjs.com/package/@nexgraph/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**GPU-first WebGL2 graph visualization** for the browser — batched node billboards, chunked edges, frustum-aware draws, and LOD-oriented scalability for large graphs. Built on **typed arrays and first-party shaders**, not a bundled scene engine.

**Repository & samples:** [github.com/nexgraph/nexgraph](https://github.com/nexgraph/nexgraph)

React bindings ship separately as [**`@nexgraph/react`**](https://www.npmjs.com/package/@nexgraph/react).

---

## Install

```bash
npm install @nexgraph/core
```

This package is **ESM-only** (`"type": "module"`). It has **no React dependency** — bring any framework or vanilla TypeScript.

### Requirements

- A runtime with **`WebGL2`** (`canvas.getContext('webgl2')`).
- Parsing and force simulation use **workers**; bundle your app so worker URLs resolve correctly (Vite, webpack 5, etc.).

---

## What you get

| Area               | Main types                                                                                                                                                                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Rendering**      | [`Renderer`](https://github.com/nexgraph/nexgraph/blob/main/packages/core/src/renderer/Renderer.ts), [`RendererOptions`](https://github.com/nexgraph/nexgraph/blob/main/packages/core/src/renderer/Renderer.ts)                                                                                                                                        |
| **Graph buffers**  | [`GraphStore`](https://github.com/nexgraph/nexgraph/blob/main/packages/core/src/graph/GraphStore.ts) — positions, sizes, colors, edges, labels                                                                                                                                                                                                         |
| **Camera & orbit** | [`Camera`](https://github.com/nexgraph/nexgraph/blob/main/packages/core/src/renderer/Camera.ts), [`OrbitControls`](https://github.com/nexgraph/nexgraph/blob/main/packages/core/src/renderer/OrbitControls.ts)                                                                                                                                         |
| **Layout**         | [`ForceLayout`](https://github.com/nexgraph/nexgraph/blob/main/packages/core/src/layout/ForceLayout.ts), [`FORCE_LAYOUT_DEFAULTS`](https://github.com/nexgraph/nexgraph/blob/main/packages/core/src/layout/ForceWorker.ts), [`createForceConfigPreset`](https://github.com/nexgraph/nexgraph/blob/main/packages/core/src/layout/forceLayoutPresets.ts) |
| **Ingest**         | [`parseGraphAsync`](https://github.com/nexgraph/nexgraph/blob/main/packages/core/src/workers/parseGraphAsync.ts) — JSON/CSV in a worker → typed [`ParseResult`](https://github.com/nexgraph/nexgraph/blob/main/packages/core/src/workers/GraphParseWorker.ts)                                                                                          |
| **Interaction**    | [`PickingSystem`](https://github.com/nexgraph/nexgraph/blob/main/packages/core/src/interaction/PickingSystem.ts) — ray picking against billboard discs                                                                                                                                                                                                 |
| **LOD / scale**    | [`LODController`](https://github.com/nexgraph/nexgraph/blob/main/packages/core/src/lod/LODController.ts), helpers like [`suggestedNodeSizeMultiplierFromLayout`](https://github.com/nexgraph/nexgraph/blob/main/packages/core/src/layout/autoNodeScale.ts)                                                                                             |

Typical app flow:

1. Create a **`Renderer`** with a DOM **`parent`** element.
2. Fill **`renderer.graph`** (`setNodes` / `setEdges`) or load via **`parseGraphAsync`**.
3. Optionally run **`ForceLayout`**, pushing **`onTick`** positions into **`graph.updatePositions`**.
4. Call **`renderer.start()`** (animation loop). Use **`renderer.fitToData()`** to frame the graph.
5. On teardown: **`forceLayout.dispose()`**, **`renderer.dispose()`**.

[`Renderer`](https://github.com/nexgraph/nexgraph/blob/main/packages/core/src/renderer/Renderer.ts) also exposes **`setDrawCallback`** / **`setBeforeFrameCallback`** for custom GL work or smoothing between frames.

---

## Usage example (minimal)

Load topology-only JSON (seeded positions + optional labels). To run physics when **`result.layoutSuggested`** is true, wire **`ForceLayout`** and call **`start`** with **`graph.positions`**, **`graph.edgeIndices`**, counts, and **`ForceConfig`** — see **`ForceLayout`** in the package exports.

```ts
import { Renderer, parseGraphAsync } from '@nexgraph/core';

const mount = document.getElementById('graph')!;
const renderer = new Renderer({ parent: mount });

async function loadJson(text: string) {
  const r = await parseGraphAsync('json', text);
  if (r.nodeCount > 0) {
    renderer.graph.setNodes(r.positions, undefined, undefined, r.labels);
  }
  if (r.edgeCount > 0) {
    renderer.graph.setEdges(r.edgeIndices);
  }
  renderer.fitToData();
}

renderer.start();

void loadJson(
  JSON.stringify({
    nodeCount: 2,
    labels: ['a', 'b'],
    edges: [{ source: 0, target: 1 }],
  }),
);
```

**Controls (orbit camera):** left-drag rotates; right-drag or Shift-drag pans the look-at target; wheel zooms distance.

---

## Advanced exports

[`packages/core/src/index.ts`](https://github.com/nexgraph/nexgraph/blob/main/packages/core/src/index.ts) also exports lower-level render helpers (`NodeRenderer`, `EdgeRenderer`, GL utilities, math namespaces). Treat those as **power-user APIs** — they may change more often than **`Renderer`** / **`GraphStore`** / **`ForceLayout`**.

---

## Documentation & demos

- Monorepo **integration guide** (roles of packages, longer sketches): [USAGE.md](https://github.com/nexgraph/nexgraph/blob/main/docs/USAGE.md) in the repo.
- **Vanilla reference app:** clone the repo and run `npm install && npm run dev` (demo workspace).

---

## License

MIT © see [`LICENSE`](https://github.com/nexgraph/nexgraph/blob/main/LICENSE) in the repository.
