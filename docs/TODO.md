# Nexgraph — todo & backlog

**Single active backlog** for the repo. Norms and rules → **[GUIDELINES.md](./GUIDELINES.md)** · Integration → **[USAGE.md](./USAGE.md)** · Shipped work → **[DONE.md](./DONE.md)** · **AI agents** → **[../AGENTS.md](../AGENTS.md)** · Overview → **[../README.md](../README.md)**

---

## Quality & tests

### Labels & layout UX

- [ ] **`maxVisibleLabels`** — prioritize largest nodes (by stored radius) when choosing which labels to build, before chunk/instance caps (closest-to-camera label bias deferred).
- [ ] **Stable layout across graph refetch** — preserve world positions for unchanged node ids when merging new API data + continuing layout (same id → keep prior world position).
- [ ] **Rich label visibility** — core handles caps + geometric ranking (e.g. largest nodes, nearest-to-camera fill, refresh when the camera moves). Search hits, selection, and neighbor highlighting stay **app-defined**: pass ids / masks into Nexgraph (e.g. always-render-this-set within budget) rather than baking query/UI semantics into the renderer.

### Interaction

- [ ] **Node drag** — pointer-drag on billboards updates layout positions; support **persist placement** (stay where dropped) vs **release-to-origin / snap-back** (and how it interacts with **`ForceLayout`** / pinned nodes).

### Labels (GPU / tests)

- [ ] Dedicated tests for SDF / label instance buffer packing (`LabelRenderer` / `SdfAtlas`)

### Force layout

- [ ] Unit tests for **`ForceWorker`** / octree / convergence harness (deterministic without flaky browser timing)
- [ ] Optional **`collision(radius)`** overlap force

### Coverage snapshot

Existing partial suites: `GraphStore`, `LODController`, `ClusterLOD`, `ChunkIndex`, `edgeWeightFactors`, `forceLayoutPresets`, layout helpers, `vec3`/`mat4`. Expand where touches occur.

---

## Post-MVP — `@nexgraph/react` (Phase 12 follow-ups)

MVP shipped → **[DONE.md](./DONE.md)** (**`NexgraphCanvas`**, **`dist/`** build).

- [ ] **`useCamera`**, **`usePicking`** hooks (or narrowed API)
- [ ] Tests with **`@testing-library/react`**

---

## Post-MVP — graph analytics (Phase 13)

- [ ] **Degree centrality** — formal API + color/size mapping (partial today: filters + demo sizing modes only)
- [ ] **Connected components** — coloring + overlay count
- [ ] **PageRank**, **community detection**, **shortest path** (selected pair)
- [ ] **AnalyticsWorker** + panel hooks in demo
- [ ] Algorithm correctness tests on fixed topologies

---

## Post-MVP — edge bundling (Phase 14)

- [ ] FDEB (or successor) with spatial acceleration
- [ ] **Polyline edges** in **`EdgeRenderer`** (multi-segment)
- [ ] Worker-side bundling + demo toggle / strength slider
- [ ] Tests on simple graphs

---

## Post-MVP — WebGPU & compute (Phases 15–16)

- [ ] **`IRenderBackend`** abstraction; WebGL2 impl behind interface
- [ ] WebGPU backend + WGSL ports + feature detection
- [ ] Parity / golden visual checks where feasible
- [ ] **Compute:** GPU force / spatial hash / GPU frustum visibility (after WebGPU base)

---

## Post-MVP — WASM & VR (Phases 17–18)

- [ ] **`wasm-pack`** workspace optional module; shared **`ArrayBuffer`** paths
- [ ] Port hottest algorithms behind lazy-loaded WASM
- [ ] **WebXR** stereo rendering + controller picking + comfort options

---

## Force layout — open questions

_(Design decisions — resolve during tuning / dogfooding.)_

1. Should **`interoperability`** preset also tune **`alphaMin`** / iteration cap for “export snapshot” parity vs stricter Nexgraph convergence?
2. **`edgeWeightInfluence`** curves: strength **`∝ w^0.5`**, distance **`∝ w^-0.5`** (`EDGE_WEIGHT_EXPONENT`) — revisit if profiling disagrees.
3. **`maxVelocity`** default under **`standard`** integration after link-force changes — may need retuning.

---

## Priority hint (impact × sequencing)

| Order | Track                         | Notes                                         |
| ----- | ----------------------------- | --------------------------------------------- |
| 1     | Tests (labels + force worker) | Protect regressions before large refactors    |
| 2     | `@nexgraph/react` follow-ups  | **`useCamera`** / **`usePicking`**, RTL tests |
| 3     | Analytics                     | Builds on existing filter/sizing math         |
| 4     | Bundling / WebGPU / WASM / VR | Heavy architecture lifts                      |

---

## Completed milestones

Active backlog items live above. Shipped work (including **`@nexgraph/react`** MVP) → **[DONE.md](./DONE.md)**.
