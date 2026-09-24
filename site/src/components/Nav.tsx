import { VERTICALS } from '../lib/productFacts';
import { AppIcon } from './AppIcon';

type Variant = 'home' | 'live' | 'pos' | 'dovidka';

/** The current page's link is drawn in its product's colour, the way Things marks where you are. */
const ACCENT: Record<Variant, string> = {
  home: 'text-pos',
  live: 'text-live',
  pos: 'text-pos',
  dovidka: 'text-pos',
};

const CTA: Record<Variant, { href: string; label: string; className: string }> = {
  home: { href: '#verticals', label: 'Обрати касу', className: 'bg-pos hover:bg-pos-press' },
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
    <header className="sticky top-0 z-40 bg-mist/85 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4 border-b border-line">
        <a href="/" className="flex items-center gap-2 text-[17px] font-bold text-ink shrink-0">
          <AppIcon size={24} />
          LiveShop
        </a>
        <nav className="hidden md:flex items-center gap-6 text-[13px] font-semibold text-ink">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              aria-current={isActive(l.href) ? 'page' : undefined}
              className={`transition-colors ${isActive(l.href) ? ACCENT[variant] : 'hover:text-muted'}`}
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a
            href={cta.href}
            className={`text-[13px] font-semibold px-3.5 h-8 inline-flex items-center rounded-full text-white ${cta.className} transition-colors whitespace-nowrap`}
          >
            {cta.label}
          </a>
          <details className="md:hidden relative group">
            <summary
              className="list-none cursor-pointer w-9 h-9 rounded-full bg-paper shadow-card grid place-items-center [&::-webkit-details-marker]:hidden"
              aria-label="Меню"
            >
              <span className="block w-4 h-0.5 bg-ink relative before:absolute before:inset-x-0 before:-top-1.5 before:h-0.5 before:bg-ink after:absolute after:inset-x-0 after:top-1.5 after:h-0.5 after:bg-ink" />
            </summary>
            <nav className="absolute right-0 mt-2 w-56 card p-2 flex flex-col text-[15px] font-medium">
              {LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  aria-current={isActive(l.href) ? 'page' : undefined}
                  className={`px-3 py-2.5 rounded-lg hover:bg-side ${isActive(l.href) ? 'text-ink bg-selected' : 'text-ink'}`}
                >
                  {l.label}
                </a>
              ))}
              <a href="/about" className="px-3 py-2.5 rounded-lg hover:bg-side text-ink">
                Про сервіс
              </a>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
