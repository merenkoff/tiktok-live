import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
          const m = id.match(/\/src\/modules\/([^/]+)\//);
          if (m) return `m-${m[1]}`;
          if (id.includes('/node_modules/dexie/')) return 'vendor-dexie';
          return undefined;
        },
      },
    },
  },
});
