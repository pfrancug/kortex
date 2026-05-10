# Kortex — completed work

Historical milestone checklist: **what has shipped**. Active backlog lives in **[TODO.md](./TODO.md)**. Norms and rules: **[GUIDELINES.md](./GUIDELINES.md)**.

---

## Bootstrap & CI

- [x] npm workspaces monorepo (`packages/*`, `apps/*`)
- [x] TypeScript across packages
- [x] Shared ESLint + Prettier
- [x] Vitest for `packages/core`
- [x] CI: typecheck + build + lint + test (`.github/workflows/ci.yml`)
- [x] ESM-first modules

---

## MVP renderer & graph (Phases 1–2)

- [x] WebGL2 renderer context, camera, orbit controls, resize + DPR cap, rAF loop
- [x] Debug overlay (FPS, frame ms, draw calls, node/edge counts)
- [x] Buffer-oriented **`GraphStore`**: positions, colors, sizes, edge indices, visibility
- [x] **`setNodes` / `setEdges` / `updatePositions` / `dispose`** — TypedArray-first API

---

## Rendering (Phases 3–4)

- [x] Instanced node billboards (single draw path), per-node color/size
- [x] GPU edge quads (screen-space width), chunked edges, visibility masks
- [x] Decision: GL_LINES rejected for width limits; quad impostor edges adopted

_Experimental stress targets (5M / 15M edges) remain backlog items — see **[TODO.md](./TODO.md)**._

---

## Interaction & performance (Phases 5–7)

- [x] Orbit / pan / zoom
- [x] GPU picking (hover/select)
- [x] Frustum chunk culling, progressive edge streaming, edge budget / sampling / distance LOD
- [x] **`ClusterLOD`** (visual clustering)
- [x] Worker JSON/CSV **`parseGraphAsync`** + transferable buffers

---

## Packaging & demo (Phases 8–9)

- [x] Scoped **`@kortex/core`** exports, `sideEffects: false`, build emits types
- [x] **`apps/demo`**: file/URL load, settings panel, LOD toggles, synthetic presets to large scales, export JSON

---

## Post-MVP features largely landed

### Labels (Phase 10)

- [x] SDF atlas (`SdfAtlas.ts`), **`LabelRenderer`**, `GraphStore.labels`
- [x] **`Renderer.maxVisibleLabels`** cap + rebuild wiring
- [x] Demo: labels toggle + max-labels slider

_Gaps:_ dedicated label/SDF tests; optional hover-priority label LOD enhancements — **[TODO.md](./TODO.md)**.

### Force simulation (Phase 11)

- [x] Barnes–Hut / octree in **`ForceWorker`**
- [x] **`ForceLayout`** worker integration, **`onTick` / `onStabilized`**, **`configure`**
- [x] Demo: Auto Layout / Stop / Reset seed, physics presets, advanced sliders
- [x] Parameter bundles: **`createForceConfigPreset`**, **`FORCE_LAYOUT_DEFAULTS`**
- [x] Edge weight plumbing + **`edgeWeightInfluence`** modes (with tests on small graphs)
- [x] Unified link pass (**`applyLinkPassesSinglePass`**) for **`d3_like`** vs **`kortex_custom`**

_Gaps:_ dedicated octree/worker convergence tests; optional **`collision(radius)`** force — **[TODO.md](./TODO.md)**.

### Force-layout roadmap (physics doc Phases A–E)

- [x] Config model + exports
- [x] **`forceScaleMode`**, **`linkAttractionMode`**, **`integrationMode`**, **`clampVelocity`**, **`recenterOnFinish`**
- [x] Demo advanced panel + preset regression tests (`forceLayoutPresets.test.ts`)
- [x] Cleanup: single link-force loop path

---

## `@kortex/react` (Phase 12 — MVP)

- [x] **`KortexCanvas`** — lifecycle-safe **`Renderer`**, forwards **`RendererOptions`** (`parent` internal); **`autoStart`**, **`onReady`**; declarative **`dataset`** / **`graph`**; optional auto **`ForceLayout`** when topology-only JSON suggests layout (`packages/react/src/KortexCanvas.tsx`)
- [x] **`peerDependencies`**: `react`, `react-dom`; ESM **`dist/`** + declarations (`npm run build --workspace=@kortex/react`)
- [x] **`apps/react-demo`** — **`KortexCanvas`** sample (**`npm run dev:react-demo`**, port 5174)

_Follow-ups:_ **[TODO.md](./TODO.md)** — **`useCamera`**, **`usePicking`**, **`@testing-library/react`**.

---

## Test coverage note

Partial suites today: **`GraphStore`**, **`LODController`**, **`ClusterLOD`**, **`ChunkIndex`**, layout helpers, **`edgeWeightFactors`**, **`forceLayoutPresets`**, math utilities. Labels and full worker convergence lack exhaustive tests — tracked in **[TODO.md](./TODO.md)**.

---

## Related docs

| Doc                              | Purpose                         |
| -------------------------------- | ------------------------------- |
| [GUIDELINES.md](./GUIDELINES.md) | Architecture & dependency rules |
| [USAGE.md](./USAGE.md)           | Embedding **`@kortex/core`**    |
| [TODO.md](./TODO.md)             | Open tasks                      |
| [../AGENTS.md](../AGENTS.md)     | Agent workflow                  |
