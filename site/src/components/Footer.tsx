import { VERTICALS } from '../lib/productFacts';
import { AppIcon } from './AppIcon';

const link = (href: string, label: string) => (
  <a key={href} href={href} className="hover:text-ink transition-colors">
    {label}
  </a>
);

export function Footer() {
  return (
    <footer className="max-w-6xl mx-auto px-6 w-full">
      <div className="border-t border-line py-12 grid gap-10 md:grid-cols-[auto_1fr_1fr_auto] items-start">
        <div className="flex items-center gap-2 text-[17px] font-bold text-ink">
          <AppIcon size={24} />
          LiveShop
        </div>
        <nav className="flex flex-col gap-3 text-sm font-medium text-muted">
          <p className="text-[13px] font-semibold text-ink">Для бізнесу</p>
          {VERTICALS.map((v) => link(v.path, v.eyebrow))}
        </nav>
        <nav className="flex flex-col gap-3 text-sm font-medium text-muted">
          <p className="text-[13px] font-semibold text-ink">Продукти</p>
          {link('/pos', 'POS каса')}
          {link('/pos#pricing', 'Тарифи')}
          {link('/live', 'TikTok LIVE')}
          {link('/yaku-kasu-obraty', 'Порівняння кас')}
          {link('/dovidka', 'Довідка')}
          {link('/about', 'Про сервіс')}
        </nav>
        <p className="text-xs text-faint max-w-sm">
          Власник сайту та сервіс — ТОВ «Технології», код ЄДРПОУ 46288273.
        </p>
      </div>
    </footer>
  );
}
