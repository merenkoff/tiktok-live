type Variant = 'home' | 'live' | 'pos';

const ACCENT: Record<Variant, string> = {
  home: 'text-ink',
  live: 'text-live',
  pos: 'text-pos',
};

export function Nav({ variant }: { variant: Variant }) {
  return (
    <header className="sticky top-0 z-40 bg-paper/90 backdrop-blur border-b border-line">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2 font-extrabold text-lg tracking-tight">
          <span className={`w-2.5 h-2.5 rounded-full bg-current ${ACCENT[variant]}`} />
          LiveShop
        </a>
        <nav className="hidden sm:flex items-center gap-8 text-sm font-medium text-muted">
          <a href="/live" className={`hover:text-ink transition-colors ${variant === 'live' ? 'text-ink' : ''}`}>
            TikTok LIVE
          </a>
          <a href="/pos" className={`hover:text-ink transition-colors ${variant === 'pos' ? 'text-ink' : ''}`}>
            POS каса
          </a>
          <a href="/about" className="hover:text-ink transition-colors">
            Про сервіс
          </a>
        </nav>
        <a
          href={variant === 'pos' ? '#download' : variant === 'live' ? '#cta' : '#products'}
          className={`text-sm font-semibold px-4 py-2 rounded-full text-white ${
            variant === 'pos' ? 'bg-pos hover:bg-pos-press' : variant === 'live' ? 'bg-live hover:bg-live-press' : 'bg-ink hover:bg-black'
          } transition-colors`}
        >
          {variant === 'pos' ? 'Завантажити' : 'Спробувати'}
        </a>
      </div>
    </header>
  );
}
