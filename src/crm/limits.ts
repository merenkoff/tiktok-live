// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/crm/limits.ts — how many lead forms the site accepts, in memory.
//
// GLOBAL, not per visitor: behind Railway's proxy `request.ip` is the proxy's
// address, so a per-IP window would be one window for everybody anyway
// (TechDocs/POS_SINGLE_INSTANCE.md). A real business sends a handful of forms a
// day; a flood that crosses the global ceiling is a bot, and refusing the
// rest of it for a few minutes costs less than filling the CRM with junk. Per
// phone, a person who taps «Надіслати» five times in an hour has been heard.
// One replica by design, so one process-wide map is the whole truth.

const GLOBAL_WINDOW_MS = 10 * 60 * 1000;
const GLOBAL_MAX = 60;
const PHONE_WINDOW_MS = 60 * 60 * 1000;
const PHONE_MAX = 5;

let globalHits: number[] = [];
const phoneHits = new Map<string, number[]>();

function recent(hits: number[], now: number, windowMs: number): number[] {
  return hits.filter((t) => now - t < windowMs);
}

/** Whether one more form may be taken now; records it when it may. */
export function leadAllowed(phone: string, now = Date.now()): boolean {
  globalHits = recent(globalHits, now, GLOBAL_WINDOW_MS);
  const mine = recent(phoneHits.get(phone) ?? [], now, PHONE_WINDOW_MS);
  if (globalHits.length >= GLOBAL_MAX || mine.length >= PHONE_MAX) {
    phoneHits.set(phone, mine);
    return false;
  }
  globalHits.push(now);
  mine.push(now);
  phoneHits.set(phone, mine);
  // Keys are dropped once their window is empty, so the map cannot grow without bound.
  if (phoneHits.size > 1000) {
    for (const [key, hits] of phoneHits) {
      if (!recent(hits, now, PHONE_WINDOW_MS).length) phoneHits.delete(key);
    }
  }
  return true;
}

/** Test seam. */
export function resetLeadLimits(): void {
  globalHits = [];
  phoneHits.clear();
}

export const LEAD_LIMITS = { GLOBAL_MAX, GLOBAL_WINDOW_MS, PHONE_MAX, PHONE_WINDOW_MS } as const;
