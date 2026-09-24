// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// check-serve-json.mjs — drive the REAL `serve` over `dist/` and assert what
// each URL of the web build answers (TechDocs/POS_PWA.md §3).
//
// Why a script and not the e2e suite: Playwright runs against `vite preview`,
// whose `tabletUnderPrefix()` plugin only IMITATES the rewrites in
// `serve.json`. Production is `serve@14` reading that file, and serve-handler
// has two habits the imitation did not have — it strips the trailing slash
// before matching a rule, and after a rewrite it re-applies the remaining
// rules to the RESULT. Both shipped in 2.3.0 as a redirect loop on `/tablet/`
// and the web `index.html` on `/tablet/login`, with every e2e test green.
// This is the only check that runs the rules the way production does.
//
//   npm run check:serve-json        (needs a built dist/ — `npm run build`)

import { spawn } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
if (!existsSync(path.join(dist, 'serve.json')) || !existsSync(path.join(dist, 'tablet.html'))) {
  console.error('check-serve-json: dist/ has no serve.json or tablet.html — run `npm run build` first.');
  process.exit(2);
}

const assets = readdirSync(path.join(dist, 'assets'));
const indexJs = assets.find((f) => /^index-.*\.js$/.test(f));
const tabletJs = assets.find((f) => /^tablet-.*\.js$/.test(f));
if (!indexJs || !tabletJs) {
  console.error('check-serve-json: dist/assets has no index-*.js / tablet-*.js entry chunk.');
  process.exit(2);
}

/** What production must answer. `entry` is which page the HTML loads. */
const CASES = [
  { path: '/', status: 200, entry: 'index' },
  { path: '/register', status: 200, entry: 'index' },
  { path: '/admin/products', status: 200, entry: 'index' },
  { path: '/tables/90', status: 200, entry: 'index' },
  // The tablet, with and without the trailing slash and on a deep route.
  { path: '/tablet/', status: 200, entry: 'tablet', cache: 'no-cache' },
  { path: '/tablet', status: 200, entry: 'tablet' },
  { path: '/tablet/login', status: 200, entry: 'tablet', cache: 'no-cache' },
  { path: '/tablet/tables/90', status: 200, entry: 'tablet', cache: 'no-cache' },
  { path: '/tablet.html', status: 200, entry: 'tablet', cache: 'no-cache' },
  { path: '/tablet-sw.js', status: 200, type: 'application/javascript', cache: 'no-cache' },
  { path: '/tablet.webmanifest', status: 200, type: 'application/manifest+json', cache: 'no-cache' },
  { path: `/assets/${indexJs}`, status: 200, type: 'application/javascript', cache: 'immutable' },
  { path: '/no-such-file.txt', status: 404 },
];

const require = createRequire(import.meta.url);
const serveBin = require.resolve('serve/build/main.js');
const port = 3900 + Math.floor(Math.random() * 100);
const child = spawn(process.execPath, [serveBin, dist, '-l', String(port)], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serveOut = '';
child.stdout.on('data', (d) => (serveOut += d));
child.stderr.on('data', (d) => (serveOut += d));

const base = `http://127.0.0.1:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(base + '/', { redirect: 'manual' });
      return;
    } catch {
      await sleep(100);
    }
  }
  throw new Error(`serve did not come up on ${base}\n${serveOut}`);
}

const failures = [];
function expect(where, ok, detail) {
  if (!ok) failures.push(`${where}: ${detail}`);
}

try {
  await waitForServer();
  for (const c of CASES) {
    // No redirects ever: a 3xx on `/tablet/` is exactly the loop that shipped.
    const res = await fetch(base + c.path, { redirect: 'manual' });
    const body = await res.text();
    const type = res.headers.get('content-type') ?? '';
    const cache = res.headers.get('cache-control') ?? '';
    expect(c.path, res.status === c.status, `status ${res.status}, wanted ${c.status}`);
    if (c.entry) {
      const wanted = c.entry === 'tablet' ? tabletJs : indexJs;
      const other = c.entry === 'tablet' ? indexJs : tabletJs;
      expect(c.path, body.includes(`/assets/${wanted}`), `does not load ${wanted}`);
      expect(c.path, !body.includes(`/assets/${other}`), `loads ${other} — the wrong entry`);
    }
    if (c.type) expect(c.path, type.startsWith(c.type), `content-type ${type}, wanted ${c.type}`);
    if (c.cache) expect(c.path, cache.includes(c.cache), `cache-control "${cache}", wanted ${c.cache}`);
  }
} finally {
  child.kill();
}

if (failures.length) {
  console.error('check-serve-json: FAIL');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log(`check-serve-json: OK — ${CASES.length} URLs answer as production must (serve ${require('serve/package.json').version}).`);
