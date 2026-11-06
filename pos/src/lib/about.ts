// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// pos/src/lib/about.ts — what the «Про програму» card says: on the desktop's
// «Обладнання» beside «Версія програми», at the foot of the owner's
// «Налаштування», and (as the macOS About panel's credits) in
// `src-tauri/src/app_menu.rs`. `pos/` cannot import `site/`, so these are the
// same facts as `site/src/lib/productFacts.ts` (`ORG`, `SITE_URL`,
// `COMPANY_URL`) and the LICENSE header, kept in step by hand.
//
// Every address here must be covered by a pattern of
// `src-tauri/capabilities/default.json` (`opener:allow-open-url`): the
// desktop opens links through the opener plugin, which refuses anything
// outside its scope. `about.test.ts` checks that, so a new link cannot land
// without its pattern (and `scripts/check-tauri-capabilities.mjs`).

export interface AboutLink {
  /** What the card prints — the bare host. */
  label: string;
  /** Where it goes, with a path, so the `https://host/*` scope matches. */
  url: string;
}

export const ABOUT = {
  productName: 'LiveShop POS',
  productSite: { label: 'the-live.shop', url: 'https://the-live.shop/pos' } as AboutLink,
  company: 'ТОВ «Технології»',
  companyLegalName: 'Товариство з обмеженою відповідальністю «Компанія Технології»',
  /** ЄДРПОУ */
  companyTaxId: '46288273',
  companySite: { label: 'technologies.llc', url: 'https://technologies.llc/' } as AboutLink,
  license: 'OwnNet Source License 1.1 (Source Available Edition)',
  licenseSite: { label: 'own-net.com', url: 'https://own-net.com/' } as AboutLink,
  copyright: '© 2026 Сергій Меренков / ТОВ «Технології»',
  /** Plain text on the card, never a `mailto:` — the opener scope is https only. */
  contactEmail: 'mer.sergei@gmail.com',
} as const;

/** Every link the card draws — what the capability test walks. */
export const ABOUT_LINKS: readonly AboutLink[] = [ABOUT.productSite, ABOUT.companySite, ABOUT.licenseSite];
