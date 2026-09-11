type Variant = 'home' | 'live' | 'pos' | 'dovidka';

const ACCENT: Record<Variant, string> = {
  home: 'text-ink',
  live: 'text-live',
  pos: 'text-pos',
  dovidka: 'text-ink',
};

const CTA: Record<Variant, { href: string; label: string; className: string }> = {
  home: { href: '#products', label: 'Спробувати', className: 'bg-ink hover:bg-black' },
  live: { href: '#cta', label: 'Спробувати', className: 'bg-live hover:bg-live-press' },
  pos: { href: '#download', label: 'Завантажити', className: 'bg-pos hover:bg-pos-press' },
  dovidka: { href: '/pos#download', label: 'Завантажити касу', className: 'bg-pos hover:bg-pos-press' },
};

export function Nav({ variant }: { variant: Variant }) {
  const cta = CTA[variant];
  const link = (href: string, label: string, active: boolean) => (
    <a href={href} className={`hover:text-ink transition-colors ${active ? 'text-ink' : ''}`}>
      {label}
    </a>
  );

  return (
    <header className="sticky top-0 z-40 bg-paper/90 backdrop-blur border-b border-line">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2 font-extrabold text-lg tracking-tight">
          <span className={`w-2.5 h-2.5 rounded-full bg-current ${ACCENT[variant]}`} />
          LiveShop
        </a>
        <nav className="hidden sm:flex items-center gap-8 text-sm font-medium text-muted">
          {link('/live', 'TikTok LIVE', variant === 'live')}
          {link('/pos', 'POS каса', variant === 'pos')}
          {link('/dovidka', 'Довідка', variant === 'dovidka')}
          {link('/about', 'Про сервіс', false)}
        </nav>
        <a
          href={cta.href}
          className={`text-sm font-semibold px-4 py-2 rounded-full text-white ${cta.className} transition-colors`}
        >
          {cta.label}
        </a>
      </div>
    </header>
  );
}
