import { Nav } from '../components/Nav';
import { Footer } from '../components/Footer';
import { Reveal } from '../components/Reveal';
import { FloatingCard } from '../components/FloatingCard';
import { DecorCircle } from '../components/DecorCircle';
import { JsonLd } from '../components/JsonLd';
import { ORGANIZATION_JSON_LD } from '../lib/organizationJsonLd';
import { useScrollToHash } from '../hooks/useScrollToHash';
import receiptChip from '../assets/fragments/receipt-chip.png';

export function Home() {
  useScrollToHash();

  return (
    <div className="min-h-screen flex flex-col overflow-x-clip">
      <JsonLd data={ORGANIZATION_JSON_LD} />
      <Nav variant="home" />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative max-w-6xl mx-auto px-6 pt-20 pb-20 text-center">
          <DecorCircle
            colorClass="bg-live/10"
            className="absolute -top-16 right-2 w-64 h-64 sm:w-96 sm:h-96 sm:-right-10 -z-10"
          />
          <Reveal>
            <h1 className="text-6xl sm:text-7xl lg:text-8xl font-extrabold tracking-tighter leading-[0.95]">
              Два інструменти
              <br />
              для одного бізнесу
            </h1>
            <p className="text-muted text-lg mt-6 max-w-xl mx-auto leading-relaxed">
              LiveShop веде продаж одягу з обох боків прилавка: в ефірі TikTok LIVE та на касі
              магазину. Одна команда, один каталог товарів — два продукти, які роблять свою
              частину роботи самі.
            </p>
          </Reveal>
        </section>

        {/* Diagonal color-block product picker stage */}
        <section id="products" className="relative py-20 sm:py-28 mt-4">
          <div
            className="absolute inset-0 bg-live"
            style={{ clipPath: 'polygon(0 0, 58% 0, 42% 100%, 0% 100%)' }}
            aria-hidden
          />
          <div
            className="absolute inset-0 bg-pos"
            style={{ clipPath: 'polygon(58% 0, 100% 0, 100% 100%, 42% 100%)' }}
            aria-hidden
          />
          <div className="relative max-w-6xl mx-auto px-6 grid sm:grid-cols-2 gap-y-20 gap-x-8 sm:gap-x-10">
            <Reveal className="relative">
              <a href="/live" className="block bg-paper rounded-2xl p-8 shadow-2xl transition-transform duration-300 hover:-translate-y-1">
                <p className="text-sm font-semibold uppercase tracking-wide text-live">Продаж в ефірі</p>
                <h2 className="text-2xl font-extrabold tracking-tight mt-2">TikTok LIVE</h2>
                <p className="text-muted mt-3 leading-relaxed">
                  Бот читає коментарі, тримає товар бронею, оформлює замовлення в Telegram і сам
                  створює ТТН Нової Пошти.
                </p>
                <p className="mt-6 text-sm font-semibold text-live flex items-center gap-1.5">
                  Дивитись, як це працює <span>→</span>
                </p>
              </a>
              <FloatingCard rotate={-6} delay={0.35} className="absolute -bottom-10 -right-4 w-52 hidden sm:block">
                <div className="px-3 py-2.5 space-y-1.5">
                  <div className="bg-mist rounded-xl rounded-bl-sm px-2.5 py-1.5 text-[11px] leading-snug max-w-[85%]">
                    Бронь на A12 створена ✅
                  </div>
                  <div className="bg-live text-white rounded-xl rounded-br-sm px-2.5 py-1.5 text-[11px] leading-snug max-w-[85%] ml-auto">
                    +380 67 123 45 67
                  </div>
                </div>
              </FloatingCard>
            </Reveal>

            <Reveal className="relative">
              <a href="/pos" className="block bg-paper rounded-2xl p-8 shadow-2xl transition-transform duration-300 hover:-translate-y-1">
                <p className="text-sm font-semibold uppercase tracking-wide text-pos">Продаж у залі</p>
                <h2 className="text-2xl font-extrabold tracking-tight mt-2">POS каса</h2>
                <p className="text-muted mt-3 leading-relaxed">
                  Штрихкоди, склад, знижки, QR-оплата — і десктопна каса, яка продовжує продавати
                  навіть без інтернету.
                </p>
                <p className="mt-6 text-sm font-semibold text-pos flex items-center gap-1.5">
                  Переглянути можливості каси <span>→</span>
                </p>
              </a>
              <FloatingCard rotate={5} delay={0.5} className="absolute -bottom-10 -right-4 w-44 hidden sm:block">
                <img src={receiptChip} alt="Успішний чек R-00019, 620,00 ₴" className="w-full h-auto block" />
              </FloatingCard>
            </Reveal>
          </div>
        </section>

        <section className="border-t border-line bg-mist mt-4">
          <div className="max-w-4xl mx-auto px-6 py-16 text-center">
            <Reveal>
              <h2 className="text-2xl font-bold">Не обов'язково брати обидва одразу</h2>
              <p className="text-muted mt-4 leading-relaxed max-w-2xl mx-auto">
                TikTok LIVE і POS каса — два окремі продукти, кожен зі своєю базою товарів.
                Можна почати з того, що зараз болить більше: хаосу в директі під час ефіру чи
                обліку на касі в залі, — і підключити другий, коли буде потрібно.
              </p>
            </Reveal>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
