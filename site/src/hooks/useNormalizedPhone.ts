// Ported verbatim from public/app.js normalizePhone() — keep in sync with
// src/leads.ts's server-side normalizer (same rules, client-side is just UX).
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');

  if (digits.length < 10) return null;

  if (digits.startsWith('380') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('80') && digits.length === 11) return `+3${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+38${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;

  return null;
}
