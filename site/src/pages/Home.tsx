import { Nav } from '../components/Nav';
import { Footer } from '../components/Footer';
import { Reveal } from '../components/Reveal';
import { FloatingCard } from '../components/FloatingCard';
import { AppIcon } from '../components/AppIcon';
import { SectionHeading } from '../components/SectionHeading';
import { VerticalsMark } from '../components/VerticalsMark';
import { VerticalCards } from '../components/VerticalCards';
import { ChevronRight, QrCode, ShieldCheck, WifiOff, type Glyph } from '../components/glyphs';
import { PricingCard } from '../components/PricingSection';
import { useScrollToHash } from '../hooks/useScrollToHash';
import { PRICING } from '../lib/productFacts';

const CORE: { value: string; label: string; icon: Glyph }[] = [
  { value: 'ПРРО', label: 'фіскальний чек через Checkbox — онлайн і офлайн', icon: ShieldCheck },
  { value: '0 мс', label: 'затримки офлайн — десктопна каса не чекає на сервер', icon: WifiOff },
  { value: 'QR', label: 'оплата на касі з автоматичним підтвердженням', icon: QrCode },
];

export function Home() {
  useScrollToHash();

  return (
    <div className="min-h-screen flex flex-col overflow-x-clip">
      <Nav variant="home" />

      <main className="flex-1">
        {/* Hero */}
        <section className="max-w-6xl mx-auto px-6 pt-16 sm:pt-20 pb-20 text-center">
          <Reveal className="flex flex-col items-center">
            <AppIcon size={144} className="drop-shadow-[0_14px_24px_rgba(0,30,80,0.22)]" />
            <p className="eyebrow text-pos mt-8">POS для чотирьох бізнесів</p>
            <h1 className="h-display mt-3">
              Одна каса для магазину,
              <br />
              квітів і кухні
            </h1>
            <p className="lede mt-6 max-w-2xl">
              LiveShop — каса з фіскалізацією ПРРО і режимом без інтернету для магазину одягу, квіткової
              крамниці, кав'ярні та ресторану. Кожна знає свою справу: стіл флориста, модифікатори,
              кухня, столи. І бот для продажу в TikTok LIVE.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
              <a href="#verticals" className="btn-pos">
                Обрати свій бізнес
              </a>
              <a href="/pos#download" className="link-more text-[17px]">
                Завантажити касу <ChevronRight size={20} />
              </a>
            </div>
            <p className="text-sm text-muted mt-5">{PRICING.pos.launch.label}.</p>
          </Reveal>
        </section>

        {/* Verticals */}
        <section id="verticals" className="max-w-6xl mx-auto px-6 pb-24 scroll-mt-16">
          <Reveal>
            <SectionHeading icon={<VerticalsMark size={64} />} title="Оберіть свій бізнес" className="mb-12" />
          </Reveal>
          <VerticalCards />
        </section>

        {/* Shared core */}
        <section className="band">
          <div className="max-w-6xl mx-auto px-6 py-20">
            <Reveal>
              <SectionHeading title="Спільне для всіх" />
            </Reveal>
            <div className="mt-10 grid sm:grid-cols-3 gap-6 text-center">
              {CORE.map((s) => (
                <Reveal key={s.value} className="card-flat px-6 py-8 flex flex-col items-center">
                  <s.icon size={48} />
                  <p className="text-5xl md:text-6xl font-bold text-pos tracking-tight tabular-nums mt-4">{s.value}</p>
                  <p className="text-muted text-[15px] mt-2">{s.label}</p>
                </Reveal>
              ))}
            </div>
            <Reveal className="mt-8 text-center">
              <a href="/pos" className="link-more text-[15px]">
                Що ще всередині каси <ChevronRight size={20} />
              </a>
            </Reveal>
          </div>
        </section>

        {/* Pricing teaser */}
        <section className="max-w-4xl mx-auto px-6 py-20">
          <PricingCard />
        </section>

        {/* TikTok LIVE */}
        <section className="max-w-6xl mx-auto px-6 pb-20">
          <Reveal className="relative">
            <div className="bg-live text-white rounded-3xl p-8 sm:p-12 grid lg:grid-cols-[1fr_auto] gap-8 items-center overflow-hidden">
              <div>
                <p className="eyebrow text-white/80">А ще — продаж в ефірі</p>
                <h2 className="h-section mt-3">TikTok LIVE</h2>
                <p className="text-white/85 mt-4 max-w-xl leading-relaxed">
                  Бот читає коментарі, тримає товар бронею, збирає ім'я, телефон і відділення в Telegram і
                  сам створює ТТН Нової Пошти — поки ви показуєте наступну модель.
                </p>
                <p className="mt-4 text-sm font-semibold text-white/80">{PRICING.live.label}</p>
                <a href="/live" className="btn mt-6 bg-paper text-live hover:bg-white/90">
                  Дивитись, як це працює <ChevronRight size={20} />
                </a>
              </div>
              <FloatingCard rotate={-4} delay={0.35} className="w-64 hidden lg:block justify-self-end">
                <div className="px-3 py-2.5 space-y-1.5 text-ink">
                  <div className="bg-side rounded-xl rounded-bl-sm px-2.5 py-1.5 text-[11px] leading-snug max-w-[85%]">
                    Бронь на A12, розмір 104 створена ✅
                  </div>
                  <div className="bg-live text-white rounded-xl rounded-br-sm px-2.5 py-1.5 text-[11px] leading-snug max-w-[85%] ml-auto">
                    +380 67 123 45 67
                  </div>
                  <div className="bg-side rounded-xl rounded-bl-sm px-2.5 py-1.5 text-[11px] leading-snug max-w-[85%]">
                    Замовлення №1042 — ТТН надішлемо сюди 💬
                  </div>
                </div>
              </FloatingCard>
            </div>
          </Reveal>
        </section>

        <section className="band">
          <div className="max-w-4xl mx-auto px-6 py-20 text-center">
            <Reveal>
              <h2 className="h-section">Не обов'язково брати все одразу</h2>
              <p className="lede mt-4 max-w-2xl mx-auto">
                Каса і TikTok LIVE — два окремі продукти, кожен зі своєю базою товарів. Столи для
                ресторану вмикаються окремим модулем. Почніть з того, що зараз болить більше, і
                підключіть решту, коли буде потрібно.
              </p>
            </Reveal>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
