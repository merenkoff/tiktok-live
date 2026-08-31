import { useRef } from 'react';
import { Nav } from '../components/Nav';
import { Footer } from '../components/Footer';
import { CTAForm } from '../components/CTAForm';
import { TwoColumnCompare } from '../components/TwoColumnCompare';
import { Faq } from '../components/Faq';
import { FaqJsonLd } from '../components/FaqJsonLd';
import { BrowserFrame } from '../components/BrowserFrame';
import { Reveal } from '../components/Reveal';
import { StickyCta } from '../components/StickyCta';
import { JsonLd } from '../components/JsonLd';
import { ORGANIZATION_JSON_LD } from '../lib/organizationJsonLd';
import posProducts from '../assets/screenshots/pos-products.png';

const CRITERIA = [
  'Облік товару за розміром і кольором, а не тільки за назвою',
  'Робота каси без інтернету в залі магазину',
  'Фіскалізація чеків (ПРРО) — вбудована чи підключається окремим сервісом',
  'Оплата карткою або QR-кодом прямо на касі',
  'Один каталог товарів для офлайн-точки й онлайн-каналів, наприклад TikTok LIVE',
];

const FAQ_ITEMS = [
  {
    q: 'Чи є в LiveShop POS фіскалізація чеків (ПРРО)?',
    a: 'Ні, наразі немає — інтеграція з ПРРО в розробці. Якщо фіскальний чек потрібен вам вже зараз, деякі інші сервіси на ринку (наприклад, Checkbox чи Poster) вже пропонують це вбудовано.',
  },
  {
    q: 'Чим LiveShop POS відрізняється від типової хмарної каси для магазину одягу?',
    a: 'Десктопна каса LiveShop продовжує пробивати чеки офлайн і синхронізується пізніше, тоді як більшість хмарних кас потребують стабільного інтернету на кожен чек.',
  },
  {
    q: 'Чи веде LiveShop POS облік за розміром і кольором?',
    a: 'Так, кожен товар можна вести за варіантами розміру та кольору окремо, з власним штрихкодом, ціною і залишком на кожен варіант.',
  },
  {
    q: 'Що станеться, якщо в магазині зникне інтернет посеред продажу?',
    a: 'Нічого — десктопна каса продовжує пробивати чеки з локальної копії каталогу, зберігає продажі в чергу і синхронізує їх, щойно мережа з\'явиться знову.',
  },
  {
    q: 'Скільки коштує LiveShop POS?',
    a: 'Залежить від кількості кас і магазинів — залиште номер телефону, і ми порахуємо разом.',
  },
];

export function ComparePage() {
  const heroRef = useRef<HTMLElement>(null);

  return (
    <div className="min-h-screen flex flex-col">
      <JsonLd data={ORGANIZATION_JSON_LD} />
      <FaqJsonLd items={FAQ_ITEMS} />
      <Nav variant="pos" />

      <main className="flex-1">
        {/* Hero */}
        <section ref={heroRef} className="max-w-4xl mx-auto px-6 pt-16 pb-16 text-center">
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-wide text-pos">
              POS каса для магазину одягу
            </p>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mt-4 leading-[1.1]">
              Яку касу обрати для магазину одягу
            </h1>
            <p className="text-muted text-lg mt-6 leading-relaxed max-w-2xl mx-auto">
              Чесний гід, а не реклама одного сервісу: на що дивитись при виборі каси для
              магазину одягу, чим відрізняються типові хмарні каси, і де в цьому порівнянні
              стоїть LiveShop POS.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <a
                href="#comparison"
                className="bg-ink hover:bg-black transition-colors text-white text-sm font-semibold px-6 py-3.5 rounded-full"
              >
                Порівняти можливості
              </a>
              <a
                href="/pos"
                className="border border-line hover:border-ink transition-colors text-sm font-semibold px-6 py-3.5 rounded-full"
              >
                Спробувати LiveShop POS
              </a>
            </div>
          </Reveal>
        </section>

        {/* Criteria checklist */}
        <section className="bg-mist border-y border-line">
          <div className="max-w-4xl mx-auto px-6 py-20">
            <Reveal>
              <h2 className="text-2xl sm:text-3xl font-bold text-center max-w-xl mx-auto">
                На що звертати увагу при виборі каси для магазину одягу
              </h2>
              <ul className="mt-10 space-y-4">
                {CRITERIA.map((c) => (
                  <li
                    key={c}
                    className="flex items-start gap-3 text-sm sm:text-base bg-paper border border-line rounded-card p-4"
                  >
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-pos shrink-0" />
                    {c}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* Comparison */}
        <section id="comparison" className="max-w-6xl mx-auto px-6 py-20">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl font-bold text-center max-w-xl mx-auto mb-10">
              Типова хмарна каса чи LiveShop POS?
            </h2>
          </Reveal>
          <TwoColumnCompare
            accentClass="text-pos"
            left={{
              title: 'Більшість кас для магазину одягу',
              points: [
                'Хмарна каса, що потребує стабільного інтернету на кожен чек',
                'Фіскалізація (ПРРО) вбудована або підключається окремим сервісом',
                'Облік товарів окремо від онлайн-каналів продажу',
              ],
            }}
            right={{
              title: 'LiveShop POS',
              points: [
                'Десктопна каса, що продовжує пробивати чеки офлайн і синхронізується пізніше',
                'Веде облік за розміром і кольором товару на рівні варіантів',
                'ПРРО-інтеграція в розробці — чесно позначаємо цей статус, а не приховуємо',
              ],
            }}
          />
        </section>

        {/* Market overview */}
        <section className="bg-mist border-y border-line">
          <div className="max-w-3xl mx-auto px-6 py-16">
            <Reveal>
              <h2 className="text-2xl font-bold text-center">Огляд систем обліку в Україні</h2>
              <p className="text-muted mt-5 leading-relaxed">
                На ринку є кілька усталених рішень: <strong>Poster</strong> — хмарна каса з
                вбудованою фіскалізацією (ПРРО) та функцією прогнозування попиту;{' '}
                <strong>Checkbox</strong> — провідний спеціалізований сервіс програмного РРО для
                бізнесу; <strong>ARM20</strong> — рішення з акцентом саме на магазини одягу,
                із сітками розмірів і фотографіями товару. Кожне з них має свої сильні сторони —
                це порівняння не про те, яке гірше, а про те, які критерії варто перевірити
                самостійно перед вибором.
              </p>
            </Reveal>
          </div>
        </section>

        {/* Visual */}
        <section className="max-w-4xl mx-auto px-6 py-20">
          <Reveal>
            <BrowserFrame
              src={posProducts}
              alt="Сторінка товарів із деревом категорій"
              accentClass="border-pos/30"
            />
          </Reveal>
        </section>

        {/* FAQ */}
        <section className="max-w-3xl mx-auto px-6 pb-20">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10">
              Питання, які запитують найчастіше
            </h2>
          </Reveal>
          <Faq items={FAQ_ITEMS} />
        </section>

        {/* Closing CTA */}
        <section className="max-w-3xl mx-auto px-6 pb-24">
          <CTAForm
            accent="pos"
            heading="Готові спробувати LiveShop POS?"
            subheading="Залиште ім'я і телефон — допоможемо порівняти з тим, чим користуєтесь зараз."
            buttonLabel="Замовити демо"
            showNameField
          />
        </section>
      </main>

      <StickyCta accent="pos" label="Спробувати LiveShop POS" href="/pos" heroRef={heroRef} />
      <Footer />
    </div>
  );
}
