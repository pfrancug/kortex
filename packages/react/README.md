# @nexgraph/react

[![npm version](https://img.shields.io/npm/v/@nexgraph/react.svg)](https://www.npmjs.com/package/@nexgraph/react)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Thin **React** bindings over [**`@nexgraph/core`**](https://www.npmjs.com/package/@nexgraph/core): mounts a WebGL2 **`Renderer`**, keeps options in sync after mount, and offers declarative **`dataset`** / **`graph`** props plus optional automatic **`ForceLayout`**.

**Repository & samples:** [github.com/nexgraph/nexgraph](https://github.com/nexgraph/nexgraph)

---

## Install

```bash
npm install @nexgraph/react react react-dom
```

Peer dependencies (**your app must satisfy these** — npm 7+ typically adds them when you install **`@nexgraph/react`**; pnpm/Yarn may expect them explicitly in **`package.json`**):

- `react` ^18 or ^19
- `react-dom` ^18 or ^19

**`@nexgraph/core`** is a dependency of **`@nexgraph/react`** — npm installs it automatically. Import types from **`@nexgraph/react`** where they are re-exported, or add **`@nexgraph/core`** only if you want a direct dependency for imports/version pinning.

### Requirements

Same as core: **`WebGL2`** and a bundler that resolves **workers** for parsing/layout (Vite and similar work out of the box).

---

## API overview

The primary export is **`NexgraphCanvas`** — a full-size canvas inside a positioned container `div`.

- **Props** mirror **[`RendererOptions`](https://github.com/nexgraph/nexgraph/blob/main/packages/core/src/renderer/Renderer.ts)** from core (e.g. `edgeOpacity`, `nodeSizeMultiplier`, `maxVisibleLabels`, `lod`, `backgroundColor`), except **`parent`** (internal).
- **`dataset`**: JSON **string** or serializable **[`GraphJsonDocument`](https://github.com/nexgraph/nexgraph/blob/main/packages/core/src/workers/GraphParseWorker.ts)** — parsed with **`parseGraphAsync('json', …)`**. Topology-only graphs can trigger **`autoForceLayout`** (default `true`).
- **`graph`**: typed buffers (`positions`, `edges`, optional colors/sizes/labels) when you already have **`Float32Array`** / **`Uint32Array`** data. Ignored while **`dataset`** is set.
- **`onReady(renderer)`**: imperative access to **`Renderer`** (picking, camera, `fitToData`, etc.).
- **`ref`**: **[`NexgraphCanvasHandle`](https://github.com/nexgraph/nexgraph/blob/main/packages/react/src/NexgraphCanvas.tsx)** — `zoomToFit()`, `setZoomDistance`, `getGraphPositions()`, etc.

**Note:** **`contextOptions`** only apply when the WebGL context is created. To change them, remount the component (e.g. React **`key`**).

Exported types include **`NexgraphCanvasProps`**, **`NexgraphCanvasGraphProps`**, **`NexgraphCanvasDataset`**, and color callback types — see **[`packages/react/src/index.ts`](https://github.com/nexgraph/nexgraph/blob/main/packages/react/src/index.ts)**.

---

## Usage example (dataset prop)

Smallest useful JSX: a JSON graph object (or string). Topology-only graphs default to **`autoForceLayout`** — physics runs asynchronously and the canvas **does not** auto-call **`fitToData`** after load, so **`onReady`** alone can run **before** data arrives. Here **`autoForceLayout={false}`** keeps seeds + **`fitToData`** after parse so the first frame is framed; set **`autoForceLayout`** back to **`true`** (default) when you want worker layout and are OK adjusting the camera (orbit / ref **`zoomToFit`**) yourself.

```tsx
import { NexgraphCanvas } from '@nexgraph/react';

const dataset = {
  nodeCount: 4,
  labels: ['a', 'b', 'c', 'd'],
  edges: [
    { source: 0, target: 1 },
    { source: 1, target: 2 },
    { source: 2, target: 3 },
    { source: 3, target: 0 },
  ],
};

export function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <NexgraphCanvas
        dataset={dataset}
        autoForceLayout={false}
        showOverlay={false}
      />
    </div>
  );
}
```

Give the parent a **non-zero height** (e.g. flex layout or explicit `height`) so the canvas has space to draw.

---

## Usage example (typed `graph` buffers)

When your app already owns GPU-friendly arrays, pass **`graph`** and omit **`dataset`**. Set **`graphForceLayout`** if you want the same worker physics path after upload.

```tsx
import { useMemo } from 'react';
import { NexgraphCanvas } from '@nexgraph/react';

export function RingGraph() {
  const graph = useMemo(() => {
    const n = 5;
    const positions = new Float32Array(n * 3); // physics fills xyz…
    const edges = new Uint32Array(n * 2);
    for (let i = 0; i < n; i++) {
      edges[i * 2] = i;
      edges[i * 2 + 1] = (i + 1) % n;
    }
    return { positions, edges };
  }, []);

  return (
    <div style={{ width: '100%', height: 480 }}>
      <NexgraphCanvas
        graph={graph}
        graphForceLayout
        fitGraph
        onReady={(r) => r.fitToData()}
      />
    </div>
  );
}
```

---

## Documentation & demos

- Full package roles and vanilla integration: [USAGE.md](https://github.com/nexgraph/nexgraph/blob/main/docs/USAGE.md).
- **React + Vite sample** in the repo: `npm run dev:react-demo` from the monorepo root (see [**apps/react-demo**](https://github.com/nexgraph/nexgraph/tree/main/apps/react-demo)).

For maximum control (single `useEffect`, no **`NexgraphCanvas`**), you can still **`new Renderer({ parent })`** from **`@nexgraph/core`** inside React — the README for core shows that pattern.

---

## License

MIT © see [`LICENSE`](https://github.com/nexgraph/nexgraph/blob/main/LICENSE) in the repository.
