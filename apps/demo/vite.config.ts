import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    /** Published package resolves `dist`; during dev use sources for HMR. */
    alias: {
      '@nexgraph/core': path.resolve(
        __dirname,
        '../../packages/core/src/index.ts',
      ),
    },
  },
  /** Avoid stale pre-bundles of the workspace package while iterating on core shaders/renderer. */
  optimizeDeps: {
    exclude: ['@nexgraph/core'],
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
