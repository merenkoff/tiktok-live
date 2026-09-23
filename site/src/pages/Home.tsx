import { Nav } from '../components/Nav';
import { Footer } from '../components/Footer';
import { Reveal } from '../components/Reveal';
import { FloatingCard } from '../components/FloatingCard';
import { DecorCircle } from '../components/DecorCircle';
import { VerticalCards } from '../components/VerticalCards';
import { PricingCard } from '../components/PricingSection';
import { useScrollToHash } from '../hooks/useScrollToHash';
import { PRICING } from '../lib/productFacts';

const CORE = [
  { value: 'ПРРО', label: 'фіскальний чек через Checkbox — онлайн і офлайн' },
  { value: '0 мс', label: 'затримки офлайн — десктопна каса не чекає на сервер' },
  { value: 'QR', label: 'оплата на касі з автоматичним підтвердженням' },
];

export function Home() {
  useScrollToHash();

  return (
    <div className="min-h-screen flex flex-col overflow-x-clip">
      <Nav variant="home" />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
          <DecorCircle
            colorClass="bg-pos/10"
            className="absolute -top-16 right-2 w-64 h-64 sm:w-96 sm:h-96 sm:-right-10 -z-10"
          />
          <DecorCircle colorClass="bg-tint-flowers" className="absolute top-24 -left-24 w-72 h-72 -z-10" />
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-wide text-pos">POS для чотирьох бізнесів</p>
            <h1 className="text-5xl sm:text-7xl lg:text-8xl font-extrabold tracking-tighter leading-[0.95] mt-4">
              Одна каса для магазину,
              <br />
              квітів і кухні
            </h1>
            <p className="text-muted text-lg mt-6 max-w-2xl mx-auto leading-relaxed">
              LiveShop — каса з фіскалізацією ПРРО і режимом без інтернету для магазину одягу, квіткової
              крамниці, кав'ярні та ресторану. Кожна знає свою справу: стіл флориста, модифікатори,
              кухня, столи. І бот для продажу в TikTok LIVE.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <a href="#verticals" className="bg-pos hover:bg-pos-press transition-colors text-white text-sm font-semibold px-6 py-3.5 rounded-full">
                Обрати свій бізнес
              </a>
              <a href="/pos#download" className="border border-line hover:border-ink transition-colors text-sm font-semibold px-6 py-3.5 rounded-full">
                Завантажити касу
              </a>
            </div>
            <p className="text-sm text-muted mt-5">{PRICING.pos.launch.label}.</p>
          </Reveal>
        </section>

        {/* Verticals */}
        <section id="verticals" className="max-w-6xl mx-auto px-6 pb-20">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl font-bold text-center max-w-xl mx-auto mb-10">Оберіть свій бізнес</h2>
          </Reveal>
          <VerticalCards />
        </section>

        {/* Shared core */}
        <section className="border-y border-line bg-mist">
          <div className="max-w-6xl mx-auto px-6 py-12">
            <Reveal>
              <p className="text-sm font-semibold uppercase tracking-wide text-muted text-center">Спільне для всіх</p>
            </Reveal>
            <div className="mt-6 grid sm:grid-cols-3 gap-8 text-center">
              {CORE.map((s) => (
                <Reveal key={s.value}>
                  <p className="font-mono text-5xl md:text-6xl font-bold text-pos tracking-tight">{s.value}</p>
                  <p className="text-muted text-sm mt-2">{s.label}</p>
                </Reveal>
              ))}
            </div>
            <Reveal className="mt-8 text-center">
              <a href="/pos" className="text-sm font-semibold text-pos">
                Що ще всередині каси →
              </a>
            </Reveal>
          </div>
        </section>

        {/* Pricing teaser */}
        <section className="max-w-4xl mx-auto px-6 py-16">
          <PricingCard />
        </section>

        {/* TikTok LIVE */}
        <section className="max-w-6xl mx-auto px-6 pb-20">
          <Reveal className="relative">
            <div className="bg-live text-white rounded-3xl p-8 sm:p-12 grid lg:grid-cols-[1fr_auto] gap-8 items-center overflow-hidden">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-white/80">А ще — продаж в ефірі</p>
                <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-3">TikTok LIVE</h2>
                <p className="text-white/85 mt-4 max-w-xl leading-relaxed">
                  Бот читає коментарі, тримає товар бронею, збирає ім'я, телефон і відділення в Telegram і
                  сам створює ТТН Нової Пошти — поки ви показуєте наступну модель.
                </p>
                <p className="mt-4 text-sm font-semibold text-white/80">{PRICING.live.label}</p>
                <a
                  href="/live"
                  className="inline-block mt-6 bg-white text-live hover:bg-white/90 transition-colors text-sm font-semibold px-6 py-3.5 rounded-full"
                >
                  Дивитись, як це працює →
                </a>
              </div>
              <FloatingCard rotate={-4} delay={0.35} className="w-64 hidden lg:block justify-self-end">
                <div className="px-3 py-2.5 space-y-1.5 text-ink">
                  <div className="bg-mist rounded-xl rounded-bl-sm px-2.5 py-1.5 text-[11px] leading-snug max-w-[85%]">
                    Бронь на A12, розмір 104 створена ✅
                  </div>
                  <div className="bg-live text-white rounded-xl rounded-br-sm px-2.5 py-1.5 text-[11px] leading-snug max-w-[85%] ml-auto">
                    +380 67 123 45 67
                  </div>
                  <div className="bg-mist rounded-xl rounded-bl-sm px-2.5 py-1.5 text-[11px] leading-snug max-w-[85%]">
                    Замовлення №1042 — ТТН надішлемо сюди 💬
                  </div>
                </div>
              </FloatingCard>
            </div>
          </Reveal>
        </section>

        <section className="border-t border-line bg-mist">
          <div className="max-w-4xl mx-auto px-6 py-16 text-center">
            <Reveal>
              <h2 className="text-2xl font-bold">Не обов'язково брати все одразу</h2>
              <p className="text-muted mt-4 leading-relaxed max-w-2xl mx-auto">
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
