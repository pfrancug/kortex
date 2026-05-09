# Kortex

**Kortex** is a toolkit for **interactive 3D graph visualization** in the browser: **WebGL2** rendering (no Three.js in the core stack), **large-graph** oriented LOD and chunking, optional **force-directed layout** in a worker, and **picking** / labels for usable UIs.

This repository is a **workspace monorepo**:

| Package             | Role                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------- |
| **`@kortex/core`**  | Framework-agnostic engine: renderer, graph buffers, layout, parsers, interaction helpers. |
| **`@kortex/demo`**  | Reference **Vite** app showing how to wire core (datasets, panel, export).                |
| **`@kortex/react`** | Placeholder for future React bindings over core.                                          |

**Integration:** [docs/USAGE.md](./docs/USAGE.md) · **Guidelines:** [docs/GUIDELINES.md](./docs/GUIDELINES.md) · **Backlog:** [docs/TODO.md](./docs/TODO.md) · **Shipped:** [docs/DONE.md](./docs/DONE.md) · **AI agents:** [AGENTS.md](./AGENTS.md)

## Run the demo

```bash
npm install
npm run dev
```

Opens the demo dev server (typically <http://localhost:5173>). Orbit, zoom, and pan with mouse / wheel as indicated in the demo UI.

## Repo scripts

```bash
npm run ts          # typecheck workspaces that define `ts`
npm run test        # tests where configured (e.g. core)
npm run build       # build workspaces that define `build`
```

Open tasks and roadmap priorities live in **[docs/TODO.md](./docs/TODO.md)** (linked from **[AGENTS.md](./AGENTS.md)** for tooling).
