<p align="center">
  <a href="https://github.com/nexgraph/nexgraph"><img src="https://img.shields.io/badge/repo-nexgraph/nexgraph-181717?logo=github" alt="GitHub repository" /></a>
  &nbsp;
  <a href="https://www.npmjs.com/package/@nexgraph/core"><img src="https://img.shields.io/npm/v/@nexgraph/core.svg?label=%40nexgraph%2Fcore" alt="@nexgraph/core on npm" /></a>
  &nbsp;
  <a href="https://www.npmjs.com/package/@nexgraph/react"><img src="https://img.shields.io/npm/v/@nexgraph/react.svg?label=%40nexgraph%2Freact" alt="@nexgraph/react on npm" /></a>
  &nbsp;
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="MIT License" /></a>
</p>

<h1 align="center">Nexgraph</h1>

<p align="center"><strong>GPU-first</strong> interactive <strong>3D graph visualization</strong> for the browser — WebGL2 engine, typed buffers, worker parsers & layout.</p>

<p align="center">
  <a href="./docs/USAGE.md"><strong>Integration guide</strong></a>
  ·
  <a href="https://www.npmjs.com/package/@nexgraph/core"><strong>npm — core</strong></a>
  ·
  <a href="https://www.npmjs.com/package/@nexgraph/react"><strong>npm — react</strong></a>
</p>

<br/>

---

## Why Nexgraph

| Focus          | What you get                                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Rendering**  | Custom **WebGL2** pipeline — batched node billboards, chunked edges, frustum-aware work, **LOD** geared toward large graphs |
| **Data model** | **TypedArrays** end‑to‑end; parsers run off the main thread                                                                 |
| **Layout**     | Optional **force‑directed** simulation in a **worker** (Barnes–Hut‑style repulsion + configurable links)                    |
| **Product UX** | Orbit camera & controls, **picking**, optional **SDF labels** — without dragging in a full scene engine                     |
| **Ecosystem**  | **`@nexgraph/core`** is framework‑agnostic; **`@nexgraph/react`** exposes **`NexgraphCanvas`** for React apps               |

The codebase favors explicit shaders and batched draws over a bundled Three/Babylon-style scene graph — see **[docs/GUIDELINES.md](./docs/GUIDELINES.md)** for architecture norms.

---

## Monorepo packages

| Package                                                                | npm                                                                                         | Role                                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| [**`@nexgraph/core`**](https://www.npmjs.com/package/@nexgraph/core)   | [npm](https://www.npmjs.com/package/@nexgraph/core) · [README](./packages/core/README.md)   | **WebGL2** engine: `Renderer`, `GraphStore`, `ForceLayout`, `parseGraphAsync`, picking, LOD |
| [**`@nexgraph/react`**](https://www.npmjs.com/package/@nexgraph/react) | [npm](https://www.npmjs.com/package/@nexgraph/react) · [README](./packages/react/README.md) | **`NexgraphCanvas`** — lifecycle‑safe mount over **`@nexgraph/core`**                       |
| **`@nexgraph/demo`**                                                   | _repo only_                                                                                 | Vanilla **Vite + TypeScript** reference app — datasets, panel, export                       |
| **`@nexgraph/react-demo`**                                             | _repo only_                                                                                 | **React + Vite** sample shipped beside **`NexgraphCanvas`**                                 |

---

## Try it locally

Clone **[nexgraph/nexgraph](https://github.com/nexgraph/nexgraph)**, install dependencies from the repo root, then explore the **demo** or **react-demo** apps in the workspace — orbit, zoom, and pan follow on‑canvas hints.

---

## Use from npm

Install **`@nexgraph/core`** for a framework‑agnostic engine, or **`@nexgraph/react`** for **`NexgraphCanvas`** (add **`react`** and **`react-dom`** — **`@nexgraph/core`** comes along automatically).

Package READMEs on npm include minimal examples: **[packages/core/README.md](./packages/core/README.md)** · **[packages/react/README.md](./packages/react/README.md)**.

---

## Documentation

| Doc                                       | Purpose                                              |
| ----------------------------------------- | ---------------------------------------------------- |
| [**USAGE.md**](./docs/USAGE.md)           | Package roles, vanilla vs React integration sketches |
| [**GUIDELINES.md**](./docs/GUIDELINES.md) | Architecture rules & dependency expectations         |
| [**TODO.md**](./docs/TODO.md)             | Roadmap / backlog                                    |
| [**DONE.md**](./docs/DONE.md)             | Shipped milestones                                   |
| [**AGENTS.md**](./AGENTS.md)              | Notes for AI coding agents                           |

---

## License

[MIT](./LICENSE) © Piotr Francug.
