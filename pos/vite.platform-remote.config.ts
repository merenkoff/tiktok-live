// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Task B PoC — build `@pos/platform` as the ONE standalone shared chunk that
// both the host (see vite.web-remote-demo.config.ts) and a module remote
// (see vite.returns-remote.config.ts) resolve `@pos/platform` to via the
// host's import map. This is what makes useAuthStore/useCartStore/etc. an
// actual singleton across the host<->remote boundary instead of two separate
// copies. react / react-dom / react-router-dom / zustand stay external —
// the host's import map supplies them too. Output:
// dist-remotes/platform/platform.js
//
//   npx vite build --config vite.platform-remote.config.ts

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'dist-remotes/platform',
    emptyOutDir: true,
    target: 'es2020',
    lib: {
      entry: path.resolve(dir, 'src/platform/index.ts'),
      formats: ['es'],
      fileName: () => 'platform.js',
    },
    rollupOptions: {
      // NOT inlined: `ui.ts` re-exports `Nav`, which reads the full module
      // registry to render nav links, so this graph reaches every module's
      // React.lazy() page. Left as normal Rollup async chunks (loaded only
      // on navigation) instead of forced into one file — see the PoC doc's
      // follow-up section for why `@pos/platform` isn't a "small" artifact
      // once `ui.ts` is included.
      external: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react-router-dom',
        'zustand',
      ],
    },
  },
});
