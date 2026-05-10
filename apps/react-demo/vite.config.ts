import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@nexgraph/core': path.resolve(
        __dirname,
        '../../packages/core/src/index.ts',
      ),
      '@nexgraph/react': path.resolve(
        __dirname,
        '../../packages/react/src/index.ts',
      ),
    },
  },
  optimizeDeps: {
    exclude: ['@nexgraph/core', '@nexgraph/react'],
  },
  server: {
    port: 5174,
    open: true,
    /** Workspace deps resolve under `node_modules/@nexgraph/*`; default watcher ignores `node_modules`, so edits to core/react never trigger HMR. */
    watch: {
      ignored: ['**/node_modules/**', '!**/node_modules/@nexgraph/**'],
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
