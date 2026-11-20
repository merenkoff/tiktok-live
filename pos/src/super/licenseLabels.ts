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

/**
 * The development mark of a licence group: «розробка» when every copy of it is
 * a development run, «розробка: 2 з 5» when some are, nothing when none is —
 * or when the server is older than the mark. A development run is a copy that
 * said so itself (it does not run in production mode): `npm run dev`, a
 * developer's machine, a cloud coding session. Without the mark such a row
 * under «Без ключа» reads like a stranger's copy.
 */
export function devLabel(lic: Pick<SuperLicenseSummary, 'installs' | 'dev_installs'>): string {
  const dev = lic.dev_installs ?? 0;
  if (dev <= 0) return '';
  return dev >= lic.installs ? 'розробка' : `розробка: ${dev} з ${lic.installs}`;
}

/** What the mark means, for the reader who hovers it. */
export const DEV_HINT =
  'Копія сама повідомила, що запущена не в робочому режимі: npm run dev, машина розробника чи хмарна сесія.';

/**
 * The origin a copy ran on. A copy that named none is shown by the address its
 * ping came from, and only a ping the server kept no address for (an older
 * server) is «(невідомо)».
 */
export function originLabel(url: string, ip?: string | null): string {
  if (url) return url;
  if (ip) return `IP ${ip}`;
  return '(невідомо)';
}

/** The address beside a named origin — when both are known and differ from each other. */
export function originNote(url: string, ip?: string | null): string {
  return url && ip ? `з IP ${ip}` : '';
}
