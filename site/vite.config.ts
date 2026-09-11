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

function prettyUrls(): Plugin {
  const rewrite = (url: string | undefined, prerendered: boolean): string | undefined => {
    if (!url) return undefined;
    const path = url.split('?')[0].replace(/\/+$/, '') || '/';
    if (PAGE_TEMPLATES[path]) return PAGE_TEMPLATES[path];
    if (path === '/dovidka' || path.startsWith('/dovidka/')) {
      return prerendered ? `${path}/index.html` : '/dovidka.html';
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
        ? resolve(__dirname, 'src/entry-server.tsx')
        : {
            main: resolve(__dirname, 'index.html'),
            live: resolve(__dirname, 'live.html'),
            pos: resolve(__dirname, 'pos.html'),
            compare: resolve(__dirname, 'compare.html'),
            dovidka: resolve(__dirname, 'dovidka.html'),
          },
    },
  },
}));
