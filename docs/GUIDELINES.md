# Kortex — engineering guidelines

Project philosophy, architecture rules, dependency policy, and force-layout principles.  
For **API integration**, see **[USAGE.md](./USAGE.md)**. For **what shipped**, see **[DONE.md](./DONE.md)**. For **active work**, see **[TODO.md](./TODO.md)**.

---

## Purpose & scope

Kortex is a **GPU-first, framework-agnostic** **WebGL2** toolkit for **3D graph visualization** at scale (large node counts, millions of edges, LOD, workers).

### Focus

- Rendering performance and batched GPU paths
- Clean data-oriented APIs (`TypedArrays`)
- Scalability (chunking, frustum cull, progressive LOD)

### Explicit boundaries

- **Core (`@kortex/core`)** must not depend on React or UI frameworks.
- **`apps/demo`** is a reference wiring surface only — not the product API.
- Heavy algorithms belong in **workers** (or future WASM); avoid blocking the main thread.

_(Historical MVP docs listed “layouts” as out of scope; **force-directed layout** is now shipped as optional **`ForceLayout`** in core.)_

---

## Repository layout

```txt
repo/
  packages/
    core/     # @kortex/core — renderer, graph store, layout, parsers
    react/    # @kortex/react — stub; future thin bindings
  apps/
    demo/     # @kortex/demo — Vite + TypeScript reference app (vanilla UI)
```

**Rules**

- `packages/core` MUST NOT depend on React.
- `apps/demo` consumes `@kortex/core` via workspace dependency only (treat like an external consumer).
- Keep generated build artifacts out of version control.
- Workspace tooling: **npm workspaces** (root `package.json`).

---

## Tech stack

### `@kortex/core`

| Area      | Choice                                                           |
| --------- | ---------------------------------------------------------------- |
| Language  | TypeScript (strict)                                              |
| Rendering | **WebGL2** — custom shaders, no bundled scene engine in core     |
| Shaders   | GLSL embedded / colocated with render modules                    |
| Data      | `Float32Array`, `Uint32Array`, `Uint8Array` as canonical buffers |
| Threading | Web Workers for parse + force simulation                         |

### `apps/demo`

| Area    | Choice                                                             |
| ------- | ------------------------------------------------------------------ |
| UI      | **Vanilla TypeScript** + DOM (`SettingsPanel` HTML/CSS), not React |
| Bundler | Vite                                                               |

---

## Dependency policy

**Rule of thumb:** every **`packages/core`** dependency must justify itself versus ~50 lines of hand-written code. Prefer fewer transitive deps in consumer bundles.

### Ground truth

See **`packages/core/package.json`** for actual runtime and dev dependencies.

### Rejected for `packages/core`

Do **not** add:

- `react`, `react-dom`, R3F, Drei
- Third-party graph visualization or embedding stacks as **runtime** dependencies of core — use `@kortex/core` as the renderer/layout surface instead
- `lodash`, `rxjs`, UI state libs (`redux`, `zustand`, …) in core
- Heavy GUI libs in core (`dat.gui`, …) — demo-only concerns

### Versioning

Prefer pinned or carefully ranged versions per workspace norms. After dependency changes: **`npm run ts && npm run lint && npm run test`** (where scripts exist).

---

## Architecture rules

### Never

- Object-per-edge or object-per-node in hot rendering paths
- React-managed graph primitives **inside `packages/core`**
- CPU loops that scale linearly with N/E per frame for baseline rendering
- Scene-graph traversal per entity for the graph mesh

### Always

- **TypedArrays** for geometry/topology owned by **`GraphStore`**
- **Batched** instancing / chunked draws — minimize draw calls
- **GPU-first** picking (offscreen ID buffer), not raycasts against JS scene objects
- Minimize **allocations** in the animation/layout tick paths

---

## Success criteria (product)

Shippable when:

- Very large edge counts remain usable with LOD controls
- Camera interaction stays responsive
- **`@kortex/core`** stays embeddable without React
- Graph mutations remain buffer-oriented and predictable

---

## Force-directed layout — principles

Force simulation lives in **`ForceWorker`** / **`ForceLayout`** (**`@kortex/core`**). We **do not** vendor third-party layout or WebGL graph products as source; **interoperability** presets are behavioral tuning only.

1. **Unified model** — Knobs compose predictably; document precedence when settings overlap.
2. **Stable defaults** — Deterministic cooling, bounded iterations, no silent blow-ups.
3. **Explicit parameters** — Prefer **`ForceConfig`** over hidden branches.
4. **Presets** — Named bundles (`interoperability`, `stability`) map to parameter sets via **`createForceConfigPreset`**.
5. **Reproducibility** — Same graph + config ⇒ same positions within float tolerance (RNG‑dependent paths notwithstanding).

### Fixed-direction choices (summary)

| Topic                            | Direction                                                                                                                               |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Cooling / stop                   | Deterministic **`alpha`** decay + **`alphaMin`** + **`maxIterations`** + optional kinetic quiet gate — batch layout to rest by default. |
| Extent clamp                     | **`extentBudgetFactor` ≤ 0** default for product presets; clamp remains for explicit stress modes.                                      |
| Barnes–Hut θ / **`distanceMin`** | Defaults aligned with common d3-style docs (**θ ≈ 0.9**, **`distanceMin` = 1** unless profiling says otherwise).                        |

### Parameter surface

Behavior flows through **`ForceConfig`** (worker), **`ForceLayout`** merge rules, and **`@kortex/core`** exports. The demo exposes a subset (presets, center gravity, edge length multiplier, advanced section).

See **`FORCE_LAYOUT_DEFAULTS`**, **`createForceConfigPreset`**, and **`ForceWorker.ts`** header/TSDoc for authoritative fields.

### Non-goals (layout)

- Bundling external **third-party** layout or renderer **source** verbatim
- Pixel-perfect identity with any other product — **parameterized similarity** only where presets specify

---

## Documentation map

| Document                         | Role                                    |
| -------------------------------- | --------------------------------------- |
| [README.md](../README.md)        | Repo entry: what Kortex is, run demo    |
| [USAGE.md](./USAGE.md)           | Packages & embedding **`@kortex/core`** |
| [GUIDELINES.md](./GUIDELINES.md) | This file — engineering norms           |
| [DONE.md](./DONE.md)             | Completed milestones                    |
| [TODO.md](./TODO.md)             | Single active backlog                   |
| [../AGENTS.md](../AGENTS.md)     | AI agent instructions                   |
