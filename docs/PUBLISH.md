# Publishing to npm (`@nexgraph` org)

## One-time

1. [Create an access token](https://docs.npmjs.com/about-access-tokens) (or use `npm login`) with publish rights to **`@nexgraph`**.
2. **`npm login`** then **`npm whoami`** — confirm your user is listed under the org with publish access.

## Release build

From monorepo root:

```bash
npm install
npm run ci
npm run release:build
```

## Publish order

**`@nexgraph/core` first**, then **`@nexgraph/react`** (react declares a dependency on core).

```bash
npm run publish:core
npm run publish:react
```

Dry run (no upload):

```bash
npm publish -w @nexgraph/core --access public --dry-run
npm publish -w @nexgraph/react --access public --dry-run
```

## Versions

Bump before each release (each package has its own semver):

```bash
npm version patch -w @nexgraph/core --no-git-tag-version
npm version patch -w @nexgraph/react --no-git-tag-version
```

Then rebuild and publish as above. Commit/tag according to your repo workflow.

## Notes

- Scoped packages must use **`--access public`** unless the package is private on a paid plan.
- **`@nexgraph/react`** depends on **`@nexgraph/core`** at **`^0.1.0`** — bump both versions together when you ship breaking core API changes.

## Provenance (optional)

From a clean Git checkout in CI, you can enable [OIDC provenance](https://docs.npmjs.com/generating-provenance-statements) (`publishConfig.provenance` + trusted publisher on npm). Not required for a first manual publish.
