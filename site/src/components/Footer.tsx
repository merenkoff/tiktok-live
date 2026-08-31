export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="max-w-6xl mx-auto px-6 py-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-2 font-extrabold text-lg tracking-tight">
          <span className="w-2.5 h-2.5 rounded-full bg-ink" />
          LiveShop
        </div>
        <nav className="flex flex-wrap gap-6 text-sm font-medium text-muted">
          <a href="/live" className="hover:text-ink transition-colors">
            TikTok LIVE
          </a>
          <a href="/pos" className="hover:text-ink transition-colors">
            POS каса
          </a>
          <a href="/about" className="hover:text-ink transition-colors">
            Про сервіс
          </a>
        </nav>
        <p className="text-xs text-muted max-w-sm">
          Власник сайту та сервіс — ТОВ «Технології», код ЄДРПОУ 46288273.
        </p>
      </div>
    </footer>
  );
}
