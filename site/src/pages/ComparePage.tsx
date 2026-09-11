import { useRef } from 'react';
import { Nav } from '../components/Nav';
import { Footer } from '../components/Footer';
import { CTAForm } from '../components/CTAForm';
import { TwoColumnCompare } from '../components/TwoColumnCompare';
import { Faq } from '../components/Faq';
import { BrowserFrame } from '../components/BrowserFrame';
import { Reveal } from '../components/Reveal';
import { StickyCta } from '../components/StickyCta';
import { useScrollToHash } from '../hooks/useScrollToHash';
import { PRODUCT, PRICING } from '../lib/productFacts';
import type { FaqItem } from '../lib/faqJsonLd';
import posProducts from '../assets/screenshots/pos-products.png';

const HANDOVER_ARTICLE = '/dovidka/zmina-prro-zamina-kasy';

const CRITERIA = [
  'Облік товару за розміром і кольором, а не тільки за назвою',
  'Робота каси без інтернету в залі магазину',
  'Фіскалізація чеків (ПРРО) — вбудована чи підключається окремим сервісом',
  'Що буде зі зміною ПРРО, якщо комп\'ютер із касою зламається посеред дня',
  'Оплата карткою або QR-кодом прямо на касі',
  'Один каталог товарів для офлайн-точки й онлайн-каналів, наприклад TikTok LIVE',
];

export const FAQ_ITEMS: FaqItem[] = [
  {
    q: `Чи є в ${PRODUCT.pos.name} фіскалізація чеків (ПРРО)?`,
    a: 'Так — через Checkbox. Каса відкриває і закриває зміни, формує Z-звіт, друкує фіскальний чек із QR-кодом, а без інтернету пробиває офлайн-чеки з резерву фіскальних кодів і відправляє їх у ДПС після відновлення зв\'язку.',
  },
  {
    q: `Чим ${PRODUCT.pos.name} відрізняється від типової хмарної каси для магазину одягу?`,
    a: 'Десктопна каса продовжує пробивати чеки офлайн — і звичайні, і фіскальні — і синхронізується пізніше, тоді як більшість хмарних кас потребують стабільного інтернету на кожен чек.',
  },
  {
    q: `Чи веде ${PRODUCT.pos.name} облік за розміром і кольором?`,
    a: 'Так, кожен товар можна вести за варіантами розміру та кольору окремо, з власним штрихкодом, ціною і залишком на кожен варіант.',
  },
  {
    q: 'Що станеться, якщо в магазині зникне інтернет посеред продажу?',
    a: 'Нічого — десктопна каса продовжує пробивати чеки з локальної копії каталогу, зберігає продажі в чергу і синхронізує їх, щойно мережа з\'явиться знову.',
  },
  {
    q: `Скільки коштує ${PRODUCT.pos.name}?`,
    a: PRICING.pos.detail,
  },
];

export function ComparePage() {
  const heroRef = useRef<HTMLElement>(null);
  useScrollToHash();

  return (
    <div className="min-h-screen flex flex-col">
      <Nav variant="pos" />

      <main className="flex-1">
        {/* Hero */}
        <section ref={heroRef} className="max-w-4xl mx-auto px-6 pt-16 pb-16 text-center">
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-wide text-pos">
              POS каса для магазину одягу
            </p>
            <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight mt-4 leading-[1.05]">
              Яку касу обрати для магазину одягу
            </h1>
            <p className="text-muted text-lg mt-6 leading-relaxed max-w-2xl mx-auto">
              Чесний гід, а не реклама одного сервісу: на що дивитись при виборі каси для
              магазину одягу, чим відрізняються типові хмарні каси, і де в цьому порівнянні
              стоїть {PRODUCT.pos.name}.
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
                Спробувати {PRODUCT.pos.name}
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
              <p className="text-sm text-muted mt-6 text-center">
                Четвертий пункт часто пропускають — а саме він визначає, чи втратите ви день
                продажів через зламаний ноутбук.{' '}
                <a href={HANDOVER_ARTICLE} className="text-pos font-semibold">
                  Розбір у довідці →
                </a>
              </p>
            </Reveal>
          </div>
        </section>

        {/* Comparison */}
        <section id="comparison" className="max-w-6xl mx-auto px-6 py-20">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl font-bold text-center max-w-xl mx-auto mb-10">
              Типова хмарна каса чи {PRODUCT.pos.name}?
            </h2>
          </Reveal>
          <TwoColumnCompare
            accentClass="text-pos"
            left={{
              title: 'Більшість кас для магазину одягу',
              points: [
                'Хмарна каса, що потребує стабільного інтернету на кожен чек',
                'Фіскалізація (ПРРО) вбудована або підключається окремим сервісом',
                'Зміна ПРРО «прив\'язана» до конкретного комп\'ютера — поломка означає аварійне закриття',
                'Облік товарів окремо від онлайн-каналів продажу',
              ],
            }}
            right={{
              title: PRODUCT.pos.name,
              points: [
                'Десктопна каса, що продовжує пробивати чеки офлайн і синхронізується пізніше',
                'ПРРО через Checkbox: онлайн і офлайн-чеки, Z-звіт, QR на принтері — без окремої програми',
                'Касу можна передати на інший комп\'ютер посеред зміни без другого Z-звіту',
                'Веде облік за розміром і кольором товару на рівні варіантів',
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
                бізнесу, з яким {PRODUCT.pos.name} інтегрована як касова програма;{' '}
                <strong>ARM20</strong> — рішення з акцентом саме на магазини одягу, із сітками
                розмірів і фотографіями товару. Кожне з них має свої сильні сторони — це
                порівняння не про те, яке гірше, а про те, які критерії варто перевірити
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
            heading={`Готові спробувати ${PRODUCT.pos.name}?`}
            subheading="Залиште ім'я і телефон — допоможемо порівняти з тим, чим користуєтесь зараз."
            buttonLabel="Замовити демо"
            showNameField
          />
        </section>
      </main>

      <StickyCta accent="pos" label={`Спробувати ${PRODUCT.pos.name}`} href="/pos" heroRef={heroRef} />
      <Footer />
    </div>
  );
}
