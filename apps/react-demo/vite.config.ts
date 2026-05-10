import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@kortex/core', '@kortex/react'],
  },
  server: {
    port: 5174,
    open: true,
    /** Workspace deps resolve under `node_modules/@kortex/*`; default watcher ignores `node_modules`, so edits to core/react never trigger HMR. */
    watch: {
      ignored: ['**/node_modules/**', '!**/node_modules/@kortex/**'],
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});