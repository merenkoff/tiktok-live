// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What the tablet's service worker precaches (TechDocs/POS_PWA.md §4), pinned
// through the pure function `scripts/assemble-web-dist.mjs` calls.

import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM script, no declaration
import { buildPrecache, entryClosure } from '../../scripts/precache.mjs';

const manifest = {
  'tablet.html': {
    file: 'assets/tablet-abc.js',
    css: ['assets/tablet-abc.css'],
    imports: ['_shared-1.js'],
    dynamicImports: ['src/pages/Sales.tsx'],
  },
  'index.html': {
    file: 'assets/index-def.js',
    css: ['assets/index-def.css'],
    imports: ['_shared-1.js'],
    dynamicImports: ['src/pages/admin/Dashboard.tsx'],
  },
  '_shared-1.js': { file: 'assets/shared-1.js', imports: ['_shared-2.js'] },
  '_shared-2.js': { file: 'assets/shared-2.js', imports: ['_shared-1.js'] },
  'src/pages/Sales.tsx': { file: 'assets/Sales-ghi.js', css: ['assets/Sales-ghi.css'] },
  'src/pages/admin/Dashboard.tsx': { file: 'assets/Dashboard-jkl.js' },
};

describe('entryClosure', () => {
  it('walks static and dynamic imports and stylesheets, and survives a cycle', () => {
    expect(entryClosure(manifest, 'tablet.html')).toEqual([
      'assets/Sales-ghi.css',
      'assets/Sales-ghi.js',
      'assets/shared-1.js',
      'assets/shared-2.js',
      'assets/tablet-abc.css',
      'assets/tablet-abc.js',
    ]);
  });

  it('is empty for an entry the manifest does not have', () => {
    expect(entryClosure(manifest, 'nope.html')).toEqual([]);
  });
});

describe('buildPrecache', () => {
  const shared = ['assets/vendor/react-1.js', 'assets/platform/platform-2.js', 'assets/platform/Page-3.js'];
  const extra = ['tablet.webmanifest', 'icons/tablet-192.png'];

  it('names the navigation target first, then every file of the tablet entry, the shared chunks and the extras', () => {
    const { urls } = buildPrecache({ manifest, sharedFiles: shared, extra });
    expect(urls[0]).toBe('/tablet/');
    expect(urls).toContain('/assets/tablet-abc.js');
    expect(urls).toContain('/assets/Sales-ghi.js');
    expect(urls).toContain('/assets/vendor/react-1.js');
    expect(urls).toContain('/assets/platform/Page-3.js');
    expect(urls).toContain('/tablet.webmanifest');
    expect(urls).toContain('/icons/tablet-192.png');
  });

  it("leaves the owner's admin entry out — it has no service worker", () => {
    const { urls } = buildPrecache({ manifest, sharedFiles: shared, extra });
    expect(urls).not.toContain('/assets/index-def.js');
    expect(urls).not.toContain('/assets/Dashboard-jkl.js');
    expect(urls).not.toContain('/index.html');
  });

  it('changes the build id whenever the list changes, and only then', () => {
    const a = buildPrecache({ manifest, sharedFiles: shared, extra });
    const b = buildPrecache({ manifest, sharedFiles: shared, extra });
    const c = buildPrecache({ manifest, sharedFiles: shared, extra: [...extra, 'icons/new.png'] });
    expect(a.buildId).toBe(b.buildId);
    expect(a.buildId).not.toBe(c.buildId);
    expect(a.buildId).toMatch(/^[0-9a-f]{12}$/);
  });

  it('honours a non-root base', () => {
    const { urls } = buildPrecache({ manifest, sharedFiles: [], extra: [], base: '/pos/' });
    expect(urls[0]).toBe('/pos/tablet/');
    expect(urls).toContain('/pos/assets/tablet-abc.js');
  });
});
