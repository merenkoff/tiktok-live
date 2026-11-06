// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// What the «Про програму» card says about THIS copy's licence
// (TechDocs/POS_LICENSING.md, phase 2): the words and the colour for the
// owner's `GET /api/pos/license/status` answer. Pure, so the card stays a
// renderer and the sentences are pinned by `licenseStatus.test.ts`.

/** The owner-only answer of `GET /api/pos/license/status` (`src/pos/license/service.ts`). */
export interface LicenseStatusView {
  status: 'unknown' | 'licensed' | 'unlicensed' | 'unreachable';
  instance_id: string | null;
  licensee: string | null;
  plan: string | null;
  expires_at: string | null;
  last_ok_at: string | null;
  last_checked_at: string | null;
  server_url: string;
  token_reason: 'absent' | 'malformed' | 'unknown_key' | 'bad_signature' | 'expired' | string | null;
}

export type LicenseTone = 'ok' | 'warn' | 'bad';

export interface LicenseLine {
  tone: LicenseTone;
  /** The headline: «Копія ліцензована» / «Копія не ліцензована» / … */
  title: string;
  /** The licensee, the plan, the expiry, or why it is not valid. */
  detail: string;
}

const TOKEN_REASON: Record<string, string> = {
  absent: 'ключ ліцензії не задано',
  malformed: 'ключ ліцензії пошкоджено',
  unknown_key: 'ключ підписано невідомим ключем автора',
  bad_signature: 'підпис ключа не збігається',
  expired: 'термін дії ключа минув',
};

function day(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** «The Live Shop (SaaS) · план saas · до 1 січня 2027» — whatever the claim carries. */
export function licenseeWords(view: Pick<LicenseStatusView, 'licensee' | 'plan' | 'expires_at'>): string {
  const parts: string[] = [];
  if (view.licensee) parts.push(view.licensee);
  if (view.plan) parts.push(`план ${view.plan}`);
  const until = day(view.expires_at);
  if (until) parts.push(`до ${until}`);
  return parts.join(' · ');
}

export function licenseLine(view: LicenseStatusView): LicenseLine {
  const who = licenseeWords(view);
  switch (view.status) {
    case 'licensed':
      return { tone: 'ok', title: 'Копія ліцензована', detail: who };
    case 'unreachable': {
      const since = day(view.last_ok_at);
      return {
        tone: 'warn',
        title: 'Ключ дійсний, сервер активації не відповідає',
        detail: [who, since ? `останній зв'язок ${since}` : "зв'язку ще не було"].filter(Boolean).join(' · '),
      };
    }
    case 'unlicensed':
      return {
        tone: 'bad',
        title: 'Копія не ліцензована',
        detail: (view.token_reason && TOKEN_REASON[view.token_reason]) || 'ключ ліцензії не дійсний',
      };
    default:
      return { tone: 'warn', title: 'Стан ліцензії ще не перевірено', detail: who };
  }
}
