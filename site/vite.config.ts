import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Production URLs are extensionless (Fastify maps /pos → dist/pos.html); make
// the dev and preview servers answer the same paths so links work locally.
// Dev renders Довідка from the shared template; preview serves what the
// prerender wrote (dist/dovidka/<slug>/index.html — the template is removed).
const PAGE_TEMPLATES: Record<string, string> = {
  '/live': '/live.html',
  '/pos': '/pos.html',
  '/yaku-kasu-obraty': '/compare.html',
};
// /pos/<slug> pages share one template the same way Довідка does.
const VERTICAL_PATH = /^\/pos\/[a-z0-9-]+$/;

function prettyUrls(): Plugin {
  const rewrite = (url: string | undefined, prerendered: boolean): string | undefined => {
    if (!url) return undefined;
    const path = url.split('?')[0].replace(/\/+$/, '') || '/';
    if (PAGE_TEMPLATES[path]) return PAGE_TEMPLATES[path];
    if (path === '/dovidka' || path.startsWith('/dovidka/') || path === '/about') {
      return prerendered ? `${path}/index.html` : '/dovidka.html';
    }
    if (VERTICAL_PATH.test(path)) {
      return prerendered ? `${path}/index.html` : '/vertical.html';
    }
    return undefined;
  };
  const middleware =
    (prerendered: boolean) =>
    (req: { url?: string }, _res: unknown, next: () => void) => {
      const target = rewrite(req.url, prerendered);
      if (target) req.url = target;
      next();
    };
  return {
    name: 'pretty-urls',
    configureServer(server) {
      server.middlewares.use(middleware(false));
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware(true));
    },
  };
}

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react(), prettyUrls()],
  server: {
    port: 3005,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: isSsrBuild
        ? resolve(import.meta.dirname, 'src/entry-server.tsx')
        : {
            main: resolve(import.meta.dirname, 'index.html'),
            live: resolve(import.meta.dirname, 'live.html'),
            pos: resolve(import.meta.dirname, 'pos.html'),
            compare: resolve(import.meta.dirname, 'compare.html'),
            dovidka: resolve(import.meta.dirname, 'dovidka.html'),
            vertical: resolve(import.meta.dirname, 'vertical.html'),
          },
    },
  },
}));
