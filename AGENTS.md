# AGENTS.md — instructions for AI coding agents

When working in this repository, **follow project norms before writing code**.

## Read first

| Priority | Document                                   | Why                                                                       |
| -------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| 1        | [docs/GUIDELINES.md](./docs/GUIDELINES.md) | Architecture rules, dependency bans, force-layout principles              |
| 2        | [docs/TODO.md](./docs/TODO.md)             | Single backlog — pick tasks from here                                     |
| 3        | [docs/USAGE.md](./docs/USAGE.md)           | Package roles (`@kortex/core`, demo, react stub) and integration patterns |
| 4        | [docs/DONE.md](./docs/DONE.md)             | What already shipped — avoid re-planning completed milestones             |

## Repo facts

- **Monorepo:** npm workspaces — `packages/core`, `packages/react` (stub), `apps/demo`.
- **Core has no React.** UI belongs in apps or future `@kortex/react`.
- **Rendering:** WebGL2 + TypedArrays + batched draws — see GUIDELINES “Never / Always”.
- **Demo:** `apps/demo/src/main.ts` is the canonical wiring reference for `Renderer`, `ForceLayout`, LOD, picking.

## Commands (verify locally)

```bash
npm install
npm run ts          # typecheck workspaces with a `ts` script
npm run lint        # where configured
npm run test        # Vitest in core
```

## Change discipline

- Match existing style and patterns in touched files; avoid drive-by refactors.
- Prefer **`packages/core`** for engine logic; keep **`apps/demo`** as wiring + UX experiments unless promoting APIs into core.
- Do **not** add forbidden dependencies listed in [GUIDELINES.md](./docs/GUIDELINES.md).
- After substantive edits, run **`npm run ts`** (and **`npm run test`** when touching core logic).

## Documentation

- Update **[docs/TODO.md](./docs/TODO.md)** when finishing or reprioritizing backlog items.
- Update **[docs/DONE.md](./docs/DONE.md)** when a milestone is clearly complete.
- Cross-link new docs from **README.md** or **docs/USAGE.md** as appropriate.

## Links

- [README.md](./README.md) — human-facing overview
- [docs/GUIDELINES.md](./docs/GUIDELINES.md) — engineering guidelines
- [docs/USAGE.md](./docs/USAGE.md) — integration guide
- [docs/DONE.md](./docs/DONE.md) — completed milestones
- [docs/TODO.md](./docs/TODO.md) — active todo list
