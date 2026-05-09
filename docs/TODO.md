# Kortex — todo & backlog

**Single active backlog** for the repo. Norms and rules → **[GUIDELINES.md](./GUIDELINES.md)** · Integration → **[USAGE.md](./USAGE.md)** · Shipped work → **[DONE.md](./DONE.md)** · **AI agents** → **[../AGENTS.md](../AGENTS.md)** · Overview → **[../README.md](../README.md)**

---

## Quality & tests

### Labels

- [ ] Dedicated tests for SDF / label instance buffer packing (`LabelRenderer` / `SdfAtlas`)

### Force layout

- [ ] Unit tests for **`ForceWorker`** / octree / convergence harness (deterministic without flaky browser timing)
- [ ] Optional **`collision(radius)`** overlap force

### Coverage snapshot

Existing partial suites: `GraphStore`, `LODController`, `ClusterLOD`, `ChunkIndex`, `edgeWeightFactors`, `forceLayoutPresets`, layout helpers, `vec3`/`mat4`. Expand where touches occur.

---

## Post-MVP — `@kortex/react` (Phase 12)

- [ ] **`<KortexGraph>`** (or equivalent) — lifecycle-safe **`Renderer`**, props sync
- [ ] **`useRenderer`**, **`useCamera`**, **`usePicking`** hooks (or narrowed API)
- [ ] **`peerDependencies`**: `react`, `react-dom`; ESM + declarations build
- [ ] Optional **`apps/react-demo`** or migrate demo incrementally
- [ ] Tests with **`@testing-library/react`**

_Package stub:_ `packages/react/src/index.ts` (`export {}`).

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

1. Should **`interoperability`** preset also tune **`alphaMin`** / iteration cap for “export snapshot” parity vs stricter Kortex convergence?
2. **`edgeWeightInfluence`** curves: strength **`∝ w^0.5`**, distance **`∝ w^-0.5`** (`EDGE_WEIGHT_EXPONENT`) — revisit if profiling disagrees.
3. **`maxVelocity`** default under **`standard`** integration after link-force changes — may need retuning.

---

## Priority hint (impact × sequencing)

| Order | Track                         | Notes                                      |
| ----- | ----------------------------- | ------------------------------------------ |
| 1     | Tests (labels + force worker) | Protect regressions before large refactors |
| 2     | `@kortex/react`               | Unlocks ecosystem adopters                 |
| 3     | Analytics                     | Builds on existing filter/sizing math      |
| 4     | Bundling / WebGPU / WASM / VR | Heavy architecture lifts                   |

---

## Completed milestones

See **[DONE.md](./DONE.md)** (MVP phases 0–9, labels & force major chunks, physics roadmap A–E).
