// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Pure label helpers for the «Ліцензії» super-admin tab (TechDocs/POS_LICENSING.md).

import type { SuperLicenseSummary } from './superApi';

/**
 * What to call a licence in the list. A verified token shows its licensee; a
 * present-but-unverifiable token and a keyless ping each get their own words,
 * so the reader never mistakes an unknown copy for a licensed one.
 */
export function licenseTitle(lic: Pick<SuperLicenseSummary, 'fingerprint' | 'verified' | 'licensee'>): string {
  if (lic.verified && lic.licensee) return lic.licensee;
  if (!lic.fingerprint) return 'Без ключа';
  return 'Ключ не підтверджено';
}

/** The origin a copy ran on, or a placeholder when it reported none. */
export function originLabel(url: string): string {
  return url || '(невідомо)';
}
