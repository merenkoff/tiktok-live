// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Task B PoC — a host build variant that proves the singleton-sharing half
// of the module-remote idea: react / react-dom / react-router-dom / zustand
// / @pos/platform are all external here (see vite.config.ts, where
// `@pos/platform` is aliased to local source instead — that alias is exactly
// what collapsed the shared chunk last time this was tried). An injected
// import map resolves the vendor libs to pinned esm.sh builds and
// `@pos/platform` to the standalone chunk from vite.platform-remote.config.ts,
// so the host and a remote module (vite.returns-remote.config.ts) end up
// importing the exact same module instances instead of two separate copies.
//
// Not a production build target — evaluation only, see
// TechDocs/POS_MODULE_REMOTE_POC.md. Output: dist-remote-demo/
//
//   npm run demo:module-remote

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const dir = path.dirname(fileURLToPath(import.meta.url));

function pkgVersion(name: string): string {
  const pkgPath = path.join(dir, 'node_modules', name, 'package.json');
  return (JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string }).version;
}

function importMapPlugin(): Plugin {
  const reactVer = pkgVersion('react');
  const reactDomVer = pkgVersion('react-dom');
  const routerVer = pkgVersion('react-router-dom');
  const zustandVer = pkgVersion('zustand');

  const importMap = {
    imports: {
      react: `https://esm.sh/react@${reactVer}`,
      'react/jsx-runtime': `https://esm.sh/react@${reactVer}/jsx-runtime`,
      'react-dom': `https://esm.sh/react-dom@${reactDomVer}?external=react`,
      'react-dom/client': `https://esm.sh/react-dom@${reactDomVer}/client?external=react`,
      'react-router-dom': `https://esm.sh/react-router-dom@${routerVer}?external=react,react-dom`,
      zustand: `https://esm.sh/zustand@${zustandVer}?external=react`,
      // Copied here post-build from dist-remotes/platform/platform.js — see
      // the `demo:module-remote` script. Same origin, no CORS/CSP surprises.
      '@pos/platform': '/assets/platform.js',
    },
  };

  return {
    name: 'inject-remote-demo-import-map',
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'importmap' },
          children: JSON.stringify(importMap, null, 2),
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  plugins: [react(), importMapPlugin()],
  resolve: {
    alias: {
      // Bundled locally, same as the default host config — only the state
      // contract (`@pos/platform`) is external/shared here.
      '@pos/platform/ui': path.resolve(dir, 'src/platform/ui.ts'),
    },
  },
  server: {
    port: 3002,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/pos-uploads': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist-remote-demo',
    emptyOutDir: true,
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
    },
  },
});
