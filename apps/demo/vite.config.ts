import { defineConfig } from 'vite';

export default defineConfig({
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
