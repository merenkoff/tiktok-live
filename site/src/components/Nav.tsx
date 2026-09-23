import { VERTICALS } from '../lib/productFacts';

type Variant = 'home' | 'live' | 'pos' | 'dovidka';

const ACCENT: Record<Variant, string> = {
  home: 'text-ink',
  live: 'text-live',
  pos: 'text-pos',
  dovidka: 'text-ink',
};

const CTA: Record<Variant, { href: string; label: string; className: string }> = {
  home: { href: '#verticals', label: 'Обрати касу', className: 'bg-ink hover:bg-black' },
  live: { href: '#cta', label: 'Спробувати', className: 'bg-live hover:bg-live-press' },
  pos: { href: '/pos#download', label: 'Завантажити', className: 'bg-pos hover:bg-pos-press' },
  dovidka: { href: '/pos#download', label: 'Завантажити касу', className: 'bg-pos hover:bg-pos-press' },
};

const LINKS = [
  { href: '/pos', label: 'POS каса' },
  ...VERTICALS.map((v) => ({ href: v.path, label: v.title })),
  { href: '/live', label: 'TikTok LIVE' },
  { href: '/dovidka', label: 'Довідка' },
];

/**
 * Sticky header. `activePath` highlights the current page (pages are
 * prerendered, so the path comes from the route, not the browser). Below `md`
 * the links fold into a <details> menu — no JS, so it works in the
 * prerendered HTML before hydration.
 */
export function Nav({ variant, activePath }: { variant: Variant; activePath?: string }) {
  const cta = CTA[variant];
  const isActive = (href: string) =>
    activePath ? activePath === href : (variant === 'live' && href === '/live') || (variant === 'pos' && href === '/pos') || (variant === 'dovidka' && href === '/dovidka');

  return (
    <header className="sticky top-0 z-40 bg-paper/90 backdrop-blur border-b border-line">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
        <a href="/" className="flex items-center gap-2 font-extrabold text-lg tracking-tight shrink-0">
          <span className={`w-2.5 h-2.5 rounded-full bg-current ${ACCENT[variant]}`} />
          LiveShop
        </a>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href) ? 'page' : undefined}
              className={`hover:text-ink transition-colors ${isActive(l.href) ? 'text-ink' : ''}`}
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a
            href={cta.href}
            className={`text-sm font-semibold px-4 py-2 rounded-full text-white ${cta.className} transition-colors whitespace-nowrap`}
          >
            {cta.label}
          </a>
          <details className="md:hidden relative group">
            <summary
              className="list-none cursor-pointer w-10 h-10 rounded-full border border-line grid place-items-center hover:border-ink transition-colors [&::-webkit-details-marker]:hidden"
              aria-label="Меню"
            >
              <span className="block w-4 h-0.5 bg-ink relative before:absolute before:inset-x-0 before:-top-1.5 before:h-0.5 before:bg-ink after:absolute after:inset-x-0 after:top-1.5 after:h-0.5 after:bg-ink" />
            </summary>
            <nav className="absolute right-0 mt-2 w-56 bg-paper border border-line rounded-card shadow-xl p-2 flex flex-col text-sm font-medium">
              {LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  aria-current={isActive(l.href) ? 'page' : undefined}
                  className={`px-3 py-2.5 rounded-lg hover:bg-mist ${isActive(l.href) ? 'text-ink bg-mist' : 'text-muted'}`}
                >
                  {l.label}
                </a>
              ))}
              <a href="/about" className="px-3 py-2.5 rounded-lg hover:bg-mist text-muted">
                Про сервіс
              </a>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
