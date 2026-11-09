// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Shared printer profiles, the network half (TechDocs/POS_PRINTER_PROFILES.md).
// `lib/printerProfiles.ts` counts prints and reads the approved list from the
// device's settings; this sends what it marked and fetches the list. It is
// host code — it reaches the api singleton, which the `@pos/platform` chunk
// must not — and runs with every desktop sync pass (`offline/sync.ts`) and
// when «Кодування кирилиці» opens. Never throws.

import { api } from '../services/api';
import {
  markReported,
  pendingReports,
  readSharedProfiles,
  saveSharedProfiles,
  type SharedPrinterProfile,
} from '../lib/printerProfiles';

/** How long the approved list is trusted before a sync pass asks again. */
const SHARED_MAX_AGE_MS = 60 * 60 * 1000;

/** Fetches the approved list and keeps it; the kept one is returned on any failure. */
export async function refreshSharedProfiles(): Promise<SharedPrinterProfile[]> {
  try {
    const data = await api.posRequest<{ profiles?: unknown }>('get', '/printer-profiles');
    return await saveSharedProfiles(data?.profiles);
  } catch {
    return (await readSharedProfiles()).profiles;
  }
}

/** Sends every count that reached its third document; a failed one waits for the next pass. */
export async function sendPendingReports(): Promise<void> {
  for (const { metaKey, state } of await pendingReports()) {
    try {
      await api.posRequest('post', '/printer-profiles/report', {
        driver: state.driver,
        table: state.table,
        esc_t: state.esc_t,
        prints: state.prints,
        paper_width_mm: state.paper_width_mm,
      });
      await markReported(metaKey, state.key);
    } catch {
      return; // no network or no session: the next pass tries again
    }
  }
}

/** One sync pass: reports first, then the list when it is old. */
export async function syncPrinterProfiles(): Promise<void> {
  try {
    await sendPendingReports();
    const { fetched_at } = await readSharedProfiles();
    if (Date.now() - fetched_at > SHARED_MAX_AGE_MS) await refreshSharedProfiles();
  } catch {
    // Never in the way of a sync pass.
  }
}
