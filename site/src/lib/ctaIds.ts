// The `data-cta` ids the site's buttons carry (TechDocs/CRM_LEADS.md). One
// table, so an id is not typed differently in two components, and so the
// prefixes the CRM reads stay in one place — `src/crm/sources.ts` turns them
// into the «hot» chips:
//
//   pricing*    → «Дивився ціни»
//   compare*    → «Порівнював з конкурентами»
//   download-*  → «Завантажив касу (<OS>)»
//   demo-menu*  → «Відкривав демо-меню»
//
// Rename one of those prefixes and a signal silently stops — the server test
// `crm.journey.test.ts` pins the server side, this comment the site side.

export const CTA = {
  /** The header's right-hand button, per page variant. */
  nav: (variant: string) => `nav-${variant}`,
  heroDownload: 'hero-download',
  heroDemo: 'hero-demo',
  heroVerticals: 'hero-verticals',
  heroWaitlist: 'hero-waitlist',
  heroToday: 'hero-today',
  heroLiveTry: 'hero-live-try',
  stickyDownload: 'sticky-download',
  stickyWaitlist: 'sticky-waitlist',
  stickyLiveTry: 'sticky-live-try',
  stickyPos: 'sticky-pos',
  pricingFixPrice: 'pricing-fix-price',
  pricingCard: 'pricing-card',
  download: (os: 'windows' | 'mac' | 'linux') => `download-${os}`,
  verticalCard: (slug: string) => `vertical-card-${slug}`,
  demoMenu: (slug: string) => `demo-menu-${slug}`,
  compareJump: 'compare-jump',
  compareLink: 'compare-link',
  compareToVertical: (slug: string) => `compare-to-${slug}`,
  homeToPos: 'home-pos',
  homeToLive: 'home-live',
  crossSellPos: 'cross-sell-pos',
  crossSellLive: 'cross-sell-live',
} as const;
