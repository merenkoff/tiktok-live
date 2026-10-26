// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * A store code suggested from the store's name — «Шабля» → `shablya` — for
 * the «Новий магазин» form (TechDocs/POS_ONBOARDING.md, O1). Only a
 * suggestion: the super admin may type any code the server accepts
 * (`^[a-z0-9][a-z0-9-]{2,40}$`, lower case because a till types it with a PIN).
 * Ukrainian letters follow the 2010 national transliteration in its simple,
 * position-free form; anything else outside a–z/0–9 becomes a hyphen.
 */
const UA: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i',
  ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', ъ: '', ы: 'y',
  э: 'e', ё: 'io', "'": '', '’': '', 'ʼ': '',
};

export const STORE_CODE_RE = /^[a-z0-9][a-z0-9-]{2,40}$/;

export function suggestStoreCode(name: string): string {
  const latin = [...name.toLowerCase()].map((ch) => UA[ch] ?? ch).join('');
  return latin
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 41)
    .replace(/-+$/g, '');
}
