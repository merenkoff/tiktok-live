// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Task B PoC — build `src/modules/returns` as a standalone ESM remote.
// react / react-dom / react-router-dom / zustand / @pos/platform are left
// external; the host supplies them via an import map (see TechDocs/
// POS_MODULE_REMOTE_POC.md). Output: dist-remotes/returns/remote-entry.js
//
//   npx vite build --config vite.returns-remote.config.ts

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'dist-remotes/returns',
    emptyOutDir: true,
    target: 'es2020',
    lib: {
      entry: path.resolve(dir, 'src/modules/returns/remote-entry.ts'),
      formats: ['es'],
      fileName: () => 'remote-entry.js',
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react-router-dom',
        'zustand',
        '@pos/platform',
      ],
      output: {
        // One self-contained file so it loads from the remote host with a
        // single request (the module's own lazy page splits are inlined).
        inlineDynamicImports: true,
      },
    },
  },
});
