import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@pos/platform/ui': path.resolve(rootDir, 'src/platform/ui.ts'),
      '@pos/platform': path.resolve(rootDir, 'src/platform/index.ts'),
    },
  },
  server: {
    port: 3002,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/pos-uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // Keep Dexie in its own shared chunk; let Rollup split everything
          // else per dynamic import() so lazy pages stay out of the entry.
          if (id.includes('/node_modules/dexie/')) return 'vendor-dexie';
          return undefined;
        },
      },
    },
  },
});
