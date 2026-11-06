// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Every link of the «Про програму» card must be inside the opener scope the
// desktop window grants (`src-tauri/capabilities/default.json`), or the
// desktop's click would be refused in silence. An approximation of the
// plugin's URL pattern matching — a tripwire, not the ACL itself.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ABOUT, ABOUT_LINKS } from './about';

// Under jsdom `import.meta.url` is an http: URL, so resolve from the package
// root vitest runs in (`pos/`).
const CAPABILITY = path.resolve(process.cwd(), 'src-tauri', 'capabilities', 'default.json');

function allowedPatterns(): RegExp[] {
  const capability = JSON.parse(readFileSync(CAPABILITY, 'utf-8')) as {
    permissions: Array<string | { identifier: string; allow?: Array<{ url?: string }> }>;
  };
  const patterns: RegExp[] = [];
  for (const permission of capability.permissions) {
    if (typeof permission === 'string' || permission.identifier !== 'opener:allow-open-url') continue;
    for (const entry of permission.allow ?? []) {
      if (!entry.url) continue;
      const source = entry.url
        .split('*')
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*');
      patterns.push(new RegExp(`^${source}$`));
    }
  }
  return patterns;
}

describe('the «Про програму» links and the desktop opener scope', () => {
  it('every link the card draws is covered by a capability pattern', () => {
    const patterns = allowedPatterns();
    expect(patterns.length).toBeGreaterThan(1);
    for (const link of ABOUT_LINKS) {
      expect(link.url, link.label).toMatch(/^https:\/\//);
      expect(
        patterns.some((pattern) => pattern.test(link.url)),
        `${link.url} is outside src-tauri/capabilities/default.json`
      ).toBe(true);
    }
  });

  it('says the facts of the licence header, the site and the company', () => {
    expect(ABOUT.productName).toBe('LiveShop POS');
    expect(ABOUT.companyTaxId).toMatch(/^\d{8}$/);
    expect(ABOUT.license).toContain('OwnNet Source License 1.1');
    expect(ABOUT.licenseSite.url).toContain('own-net.com');
    expect(ABOUT.productSite.url).toContain('the-live.shop');
    expect(ABOUT.companySite.url).toContain('technologies.llc');
    expect(ABOUT.contactEmail).toBe('mer.sergei@gmail.com');
  });
});
