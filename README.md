# Nexgraph

**Nexgraph** is a **GPU-first** toolkit for **interactive 3D graph visualization** in the browser. The core ships a **custom WebGL2** pipeline—batched node billboards, chunked edges, frustum-aware draws, and **LOD** for large graphs—built on **typed arrays and first-party shaders**, not a bundled scene engine. Optional **force-directed layout** runs in a worker; **picking** and **labels** round out usable UIs.

This repository is a **workspace monorepo**:

| Package                    | Role                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **`@nexgraph/core`**       | Framework-agnostic **WebGL2** engine: renderer, graph buffers, layout, parsers, interaction helpers.                           |
| **`@nexgraph/demo`**       | Reference **Vite** app (vanilla TS) — datasets, panel, export.                                                                 |
| **`@nexgraph/react-demo`** | **Vite + React** sample using **`NexgraphCanvas`** (`npm run dev:react-demo`).                                                 |
| **`@nexgraph/react`**      | **`NexgraphCanvas`** — thin lifecycle bindings over **`@nexgraph/core`** (build: `npm run build --workspace=@nexgraph/react`). |

**Integration:** [docs/USAGE.md](./docs/USAGE.md) · **Guidelines:** [docs/GUIDELINES.md](./docs/GUIDELINES.md) · **Backlog:** [docs/TODO.md](./docs/TODO.md) · **Shipped:** [docs/DONE.md](./docs/DONE.md) · **AI agents:** [AGENTS.md](./AGENTS.md)

## Run the demo

```bash
npm install
npm run dev
```

Opens the vanilla demo (typically <http://localhost:5173>) — orbit, zoom, and pan per on-screen hints. For **`@nexgraph/react`**: **`npm run dev:react-demo`** (port **5174**).

## Repo scripts

```bash
npm run ts          # typecheck workspaces that define `ts`
npm run test        # tests where configured (e.g. core)
npm run build       # build workspaces that define `build`
```

## License

[MIT](./LICENSE) © Piotr Francug.

Open tasks and roadmap priorities live in **[docs/TODO.md](./docs/TODO.md)** (linked from **[AGENTS.md](./AGENTS.md)** for tooling).
