import { VERTICALS } from '../lib/productFacts';

const link = (href: string, label: string) => (
  <a key={href} href={href} className="hover:text-ink transition-colors">
    {label}
  </a>
);

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="max-w-6xl mx-auto px-6 py-12 grid gap-10 md:grid-cols-[auto_1fr_1fr_auto] items-start">
        <div className="flex items-center gap-2 font-extrabold text-lg tracking-tight">
          <span className="w-2.5 h-2.5 rounded-full bg-ink" />
          LiveShop
        </div>
        <nav className="flex flex-col gap-3 text-sm font-medium text-muted">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink">Для бізнесу</p>
          {VERTICALS.map((v) => link(v.path, v.eyebrow))}
        </nav>
        <nav className="flex flex-col gap-3 text-sm font-medium text-muted">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink">Продукти</p>
          {link('/pos', 'POS каса')}
          {link('/pos#pricing', 'Тарифи')}
          {link('/live', 'TikTok LIVE')}
          {link('/yaku-kasu-obraty', 'Порівняння кас')}
          {link('/dovidka', 'Довідка')}
          {link('/about', 'Про сервіс')}
        </nav>
        <p className="text-xs text-muted max-w-sm">
          Власник сайту та сервіс — ТОВ «Технології», код ЄДРПОУ 46288273.
        </p>
      </div>
    </footer>
  );
}
