import { Nav } from '../components/Nav';
import { Footer } from '../components/Footer';
import { ProductCard } from '../components/ProductCard';
import { Reveal } from '../components/Reveal';
import { JsonLd } from '../components/JsonLd';
import { ORGANIZATION_JSON_LD } from '../lib/organizationJsonLd';
import liveScreenshot from '../assets/screenshots/live-session.png';
import posScreenshot from '../assets/screenshots/pos-register.png';

export function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <JsonLd data={ORGANIZATION_JSON_LD} />
      <Nav variant="home" />

      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
          <Reveal>
            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.05]">
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

        <section className="max-w-6xl mx-auto px-6 pb-24">
          <div className="grid sm:grid-cols-2 gap-6">
            <Reveal>
              <ProductCard
                href="/live"
                eyebrow="Продаж в ефірі"
                title="TikTok LIVE"
                body="Бот читає коментарі, тримає товар бронею, оформлює замовлення в Telegram і сам створює ТТН Нової Пошти."
                accentClass="text-live"
                bgAccentClass="bg-live/5 hover:bg-live/10"
                ringAccentClass="hover:border-live/40"
                screenshot={liveScreenshot}
                screenshotAlt="Панель керування TikTok LIVE-сесією"
                cta="Дивитись, як це працює"
              />
            </Reveal>
            <Reveal>
              <ProductCard
                href="/pos"
                eyebrow="Продаж у залі"
                title="POS каса"
                body="Штрихкоди, склад, знижки, QR-оплата — і десктопна каса, яка продовжує продавати навіть без інтернету."
                accentClass="text-pos"
                bgAccentClass="bg-pos/5 hover:bg-pos/10"
                ringAccentClass="hover:border-pos/40"
                screenshot={posScreenshot}
                screenshotAlt="Екран каси зі списком товарів у чеку"
                cta="Переглянути можливості каси"
              />
            </Reveal>
          </div>
        </section>

        <section className="border-t border-line bg-mist">
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
