// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Service worker of the tablet PWA (TechDocs/POS_PWA.md §4). A TEMPLATE:
// `scripts/assemble-web-dist.mjs` fills the PRECACHE placeholder with every
// file of the host build and the BUILD_ID one with a hash of that list, then
// writes it to `dist/tablet-sw.js`. Registered only from `tablet-main.tsx`, with scope
// `/tablet/`, so the owner's `/admin` tabs on the same origin are never
// controlled by it.
//
// What it does, and deliberately does not do:
//   - the host build (`/tablet/`, `/assets/**`, the manifest, the icons) is
//     precached and served cache-first: a kiosk must open instantly, and a
//     newer build is offered on a banner (`hooks/useAppUpdate.ts`), never
//     swapped in under the waiter's hands — no `skipWaiting()` on install;
//   - a module remote's `manifest.json` / `.sig` / `remote-entry.js` /
//     `style.css` go network-first with a short timeout and fall back to the
//     cache, so online the host verifies fresh bytes and offline it gets the
//     last pair it verified; the hashed sub-chunks are cache-first; and a
//     manifest that just came in pre-warms every file in its signed map, so a
//     screen the waiter never opened online still opens offline;
//   - `/api/**` and `/pos-uploads/**` are never touched — the Dexie mirrors
//     and `offline/photos.ts` own that, and an API answer served from a
//     worker cache would be a lie with a green tick on it.

/* eslint-env serviceworker */

const BUILD_ID = '__BUILD_ID__';
const PRECACHE = __PRECACHE__;

const SHELL_CACHE = `pos-tablet-shell-${BUILD_ID}`;
const REMOTES_CACHE = 'pos-tablet-remotes';
const SHELL_PREFIX = 'pos-tablet-shell-';
const SCOPE_PATH = '/tablet/';
const NETWORK_FIRST_MS = 3000;

const REMOTE_FRESH_FILES = new Set(['manifest.json', 'manifest.json.sig', 'remote-entry.js', 'style.css']);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(SHELL_PREFIX) && key !== SHELL_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isApiPath(pathname) {
  return pathname.startsWith('/api/') || pathname.startsWith('/pos-uploads/');
}

function basename(pathname) {
  return pathname.slice(pathname.lastIndexOf('/') + 1);
}

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, { ignoreSearch: false });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request).then(
      (r) => {
        clearTimeout(timer);
        resolve(r);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

async function networkFirst(cacheName, request, onFresh) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetchWithTimeout(request, NETWORK_FIRST_MS);
    if (response.ok) {
      await cache.put(request, response.clone());
      if (onFresh) onFresh(response.clone());
    }
    return response;
  } catch (error) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw error;
  }
}

/**
 * A remote's signed `files` map names every chunk of the bundle by path
 * relative to the manifest. Fetching them now, while the network is there, is
 * what makes a lazily-loaded page of the module open later without one.
 */
function prewarmRemote(manifestUrl, response) {
  response
    .json()
    .then((manifest) => {
      const files = manifest && manifest.files && typeof manifest.files === 'object' ? Object.keys(manifest.files) : [];
      if (files.length === 0) return;
      return caches.open(REMOTES_CACHE).then((cache) =>
        Promise.all(
          files.map((file) => {
            const url = new URL(file, manifestUrl).href;
            return cache.match(url).then((hit) =>
              hit ? undefined : fetch(url).then((r) => (r.ok ? cache.put(url, r) : undefined)).catch(() => undefined)
            );
          })
        )
      );
    })
    .catch(() => undefined);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Not answered at all — the page's own network stack issues these. Not
  // `respondWith(fetch(request))` either: a worker-issued POST with a body is
  // one Playwright's context routes cannot answer, so the e2e mock API would
  // never see a login (the CDN's GETs it relays are fine).
  if (request.method !== 'GET' || isApiPath(url.pathname)) return;

  if (request.mode === 'navigate') {
    if (!url.pathname.startsWith(SCOPE_PATH)) return;
    event.respondWith(
      caches
        .open(SHELL_CACHE)
        .then((cache) => cache.match(SCOPE_PATH))
        .then((hit) => hit || fetch(request))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    // Hashed assets, the manifest, the icons: all part of this build.
    event.respondWith(cacheFirst(SHELL_CACHE, request));
    return;
  }

  // Cross-origin: a module remote on its CDN. Anything else (nothing today —
  // the tablet page loads no third-party script) goes the same way, which is
  // harmless: an opaque failure is not cached.
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return;
  const name = basename(url.pathname);
  if (REMOTE_FRESH_FILES.has(name)) {
    event.respondWith(
      networkFirst(REMOTES_CACHE, request, name === 'manifest.json' ? (r) => prewarmRemote(url.href, r) : null)
    );
    return;
  }
  event.respondWith(cacheFirst(REMOTES_CACHE, request));
});
