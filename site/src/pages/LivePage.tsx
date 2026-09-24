import { useRef } from 'react';
import { Nav } from '../components/Nav';
import { Footer } from '../components/Footer';
import { CTAForm } from '../components/CTAForm';
import { FeatureRow } from '../components/FeatureRow';
import { TwoColumnCompare } from '../components/TwoColumnCompare';
import { Faq } from '../components/Faq';
import { BrowserFrame } from '../components/BrowserFrame';
import { TelegramChatMockup } from '../components/TelegramChatMockup';
import { Reveal, StaggerGroup, StaggerItem } from '../components/Reveal';
import { AppIcon } from '../components/AppIcon';
import { SectionHeading } from '../components/SectionHeading';
import { StickyCta } from '../components/StickyCta';
import { useScrollToHash } from '../hooks/useScrollToHash';
import { PRICING, FEATURES } from '../lib/productFacts';
import type { FaqItem } from '../lib/faqJsonLd';
import { BarChart3, Bot, Check, ChevronRight, Coins, Lock, MessageCircle, Monitor, Sparkles, Users, Video } from '../components/glyphs';
import liveScreenshot from '../assets/screenshots/live-session.png';

const STATS = [
  { value: '3 мови', label: 'розпізнає коментарі — EN, UK, RU' },
  { value: '~5 хв', label: 'тримає бронь на товар' },
  { value: '24/7', label: 'бот приймає дані покупця' },
];

const EARLY_ACCESS_PERKS = [
  {
    icon: Lock,
    t: 'Ціна закріплюється',
    d: `${PRICING.live.price} грн/міс — назавжди для тих, хто підключився зараз, скільки б не коштував тариф пізніше.`,
  },
  {
    icon: Sparkles,
    t: 'Усі нові функції — у вашому тарифі',
    d: 'Те, що ми додамо до LIVE-модуля далі, входить у вашу ціну без доплат. Для тих, хто прийде пізніше, частина функцій буде у старших тарифах.',
  },
  {
    icon: MessageCircle,
    t: 'Прямий канал',
    d: 'Telegram із розробником замість тікетів підтримки — і голос у тому, що робити наступним.',
  },
];

const COMING_SOON = [
  {
    icon: Bot,
    t: FEATURES.liveAiComments.label,
    d: '«Чи є 46 розмір?» — бот відповідає в коментарях сам, із реальних залишків, поки ти показуєш наступну модель.',
  },
  {
    icon: Monitor,
    t: FEATURES.liveStockOverlay.label,
    d: 'Віджет для OBS чи TikTok Studio: «залишилось 2 шт» просто в кадрі — глядачі бачать, що товар закінчується.',
  },
  {
    icon: BarChart3,
    t: FEATURES.liveAnalytics.label,
    d: 'Конверсія «коментар → замовлення», топ-товари ефіру, кращий час — після кожного ефіру, без таблиць у Excel.',
  },
];

export const FAQ_ITEMS: FaqItem[] = [
  {
    q: 'Що саме розуміє бот у коментарях?',
    a: 'Код товару і, за наявності, розмір — у форматі на кшталт «A12 92» або фрази «хочу A12», «беру K19». Парсер розпізнає це українською, російською та англійською.',
  },
  {
    q: 'Що буде, якщо два глядачі напишуть один код одночасно?',
    a: 'Спрацює бронювання: перший коментар отримує товар у резерв на кілька хвилин, race-safe на рівні бази даних, тож подвійного продажу не буде.',
  },
  {
    q: 'Що робити, якщо покупець не встиг оформити замовлення?',
    a: 'Бронь автоматично звільняється через кілька хвилин — окреме фонове завдання щохвилини прибирає прострочені брони, і товар знову доступний іншим глядачам.',
  },
  {
    q: 'Чи потрібно вручну створювати ТТН?',
    a: 'Ні — після того як продавець підтверджує оплату в адмінці, ТТН Нової Пошти генерується автоматично через API, а покупець отримує номер для відстеження в тому ж Telegram-чаті.',
  },
  {
    q: 'Що якщо TikTok LIVE обірветься?',
    a: 'З\'єднання переперевіряється автоматично з наростаючою паузою між спробами (backoff), без ручного перезапуску сесії.',
  },
  {
    q: 'Скільки продавців може працювати одночасно?',
    a: 'Система багатокористувацька: кожен продавець запускає свою власну LIVE-сесію незалежно від інших, з окремим Telegram-ботом і окремою чергою замовлень.',
  },
  {
    q: 'Чи бачу я, що відбувається в ефірі, у реальному часі?',
    a: 'Так — панель показує потік коментарів, броней і помилок наживо через WebSocket, без оновлення сторінки.',
  },
  {
    q: 'Скільки це коштує?',
    a: PRICING.live.detail,
  },
];

export function LivePage() {
  const heroRef = useRef<HTMLElement>(null);
  useScrollToHash();

  return (
    <div className="min-h-screen flex flex-col">
      <Nav variant="live" />

      <main className="flex-1">
        {/* Hero */}
        <section ref={heroRef} className="max-w-6xl mx-auto px-6 pt-16 sm:pt-20 pb-20 grid lg:grid-cols-2 gap-12 items-center">
          <Reveal>
            <div className="w-20 h-20 rounded-[20px] bg-paper shadow-card grid place-items-center">
              <Video size={48} />
            </div>
            <p className="eyebrow text-live mt-8">
              Операційна система для TikTok LIVE
            </p>
            <h1 className="h-display mt-3">
              Продавай у ефірі,
              <br />
              не в хаосі
            </h1>
            <p className="lede mt-6">
              Коментар → бронь → Telegram. Поки ти показуєш наступну модель одягу, попередні
              замовлення вже зібрані, а бот питає в покупця ім'я, телефон і відділення Нової
              Пошти — без твоєї участі.
            </p>
            <div className="mt-8">
              <CTAForm
                id="cta"
                accent="live"
                heading="Спробувати на своєму ефірі"
                subheading={`${PRICING.live.label} для перших користувачів. Залиште номер — покажемо, як це працює на прикладі вашого магазину.`}
                buttonLabel="Хочу демо"
              />
            </div>
          </Reveal>
          <Reveal>
            <BrowserFrame
              src={liveScreenshot}
              alt="Панель керування LIVE-сесією зі статистикою ефіру"
              dark
              elevated
            />
            <div className="relative z-10 -mt-10 ml-10 mr-6 rotate-1">
              <TelegramChatMockup />
            </div>
          </Reveal>
        </section>

        {/* Stat strip */}
        <section className="max-w-6xl mx-auto px-6">
          <div className="grid sm:grid-cols-3 gap-6 text-center">
            {STATS.map((s) => (
              <div key={s.label} className="card px-6 py-8">
                <p className="tabular-nums text-5xl md:text-6xl font-bold text-live tracking-tight">{s.value}</p>
                <p className="text-muted text-[15px] mt-2">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Before/after */}
        <section className="max-w-6xl mx-auto px-6 py-24">
          <Reveal>
            <SectionHeading icon={<Sparkles size={48} />} title="До і після LiveShop" />
          </Reveal>
          <div className="mt-12">
            <TwoColumnCompare
              accentClass="text-live"
              left={{
                title: 'Без автоматизації',
                points: [
                  'Після ефіру годину гортаєш директ у пошуках коментарів «беру»',
                  'Хтось написав код двічі — не завжди зрозуміло, кому дістався товар',
                  'Дані покупця збираєш вручну в переписці',
                  'ТТН створюєш окремо, вручну переносячи адресу',
                ],
              }}
              right={{
                title: 'З LiveShop',
                points: [
                  'Бот сам знаходить коментарі з кодом товару в потоці ефіру',
                  'Race-safe бронювання не дає двом покупцям забрати один товар',
                  'Ім\'я, телефон і відділення бот питає сам у Telegram',
                  'ТТН генерується автоматично після підтвердження оплати',
                ],
              }}
            />
          </div>
        </section>

        {/* How it looks */}
        <section className="band">
          <div className="max-w-4xl mx-auto px-6 py-24">
            <Reveal>
              <SectionHeading icon={<Video size={48} />} title="Як це виглядає в ефірі" />
            </Reveal>
            <StaggerGroup className="mt-12 grid sm:grid-cols-3 gap-8">
              {[
                { n: '1', t: 'Коментар', d: 'Глядач пише «A12 104» або «хочу A12» у чаті ефіру.' },
                { n: '2', t: 'Бронь', d: 'Товар резервується на ім\'я глядача на кілька хвилин.' },
                { n: '3', t: 'Telegram', d: 'Бот у приватних повідомленнях збирає дані на доставку.' },
              ].map((s) => (
                <StaggerItem key={s.n}>
                  <div className="text-center">
                    <div className="w-11 h-11 rounded-full bg-live text-white text-lg font-bold grid place-items-center mx-auto shadow-card">
                      {s.n}
                    </div>
                    <h3 className="font-bold mt-4">{s.t}</h3>
                    <p className="text-muted text-sm mt-2 leading-relaxed">{s.d}</p>
                  </div>
                </StaggerItem>
              ))}
            </StaggerGroup>
          </div>
        </section>

        {/* Feature narrative */}
        <section className="max-w-6xl mx-auto px-6 pt-24">
          <Reveal>
            <SectionHeading icon={<Bot size={48} />} title="Що саме автоматизує LiveShop" />
          </Reveal>
        </section>
        <section className="max-w-6xl mx-auto px-6 divide-y divide-line">
          <FeatureRow
            eyebrow="Розпізнавання коментарів"
            title="Розуміє коментарі, тримає товар"
            body="Парсер витягує код товару й розмір із коментаря трьома мовами — англійською, українською та російською — і у форматах на кшталт «A12 92» або «хочу A12». Знайдений товар одразу резервується за race-safe логікою на рівні бази даних, тож навіть два одночасні коментарі не заберуть один і той самий розмір."
            bullets={[
              'Розпізнавання EN / UK / RU в одному потоці коментарів',
              'Автоматична бронь ~5 хвилин на знайдений товар',
              'Фонове завдання щохвилини звільняє прострочені брони',
            ]}
            accentClass="text-live"
          />
          <FeatureRow
            eyebrow="Оформлення замовлення"
            title="Оформлення без твоєї участі"
            body="Щойно бронь створена, Telegram-бот пише покупцю особисто: питає ім'я, номер телефону та відділення Нової Пошти для доставки. Продавцю не потрібно перемикатись між ефіром і директом — весь діалог веде бот."
            accentClass="text-live"
            reverse
          />
          <FeatureRow
            eyebrow="Доставка"
            title="Відправляє сама"
            body="Коли продавець підтверджує оплату в адмін-панелі, система звертається до API Нової Пошти, генерує ТТН і надсилає номер для відстеження покупцю в той самий Telegram-чат — без ручного перенесення адреси."
            accentClass="text-live"
          />
          <FeatureRow
            eyebrow="Масштаб"
            title="Готова працювати щодня"
            body="Кожен продавець запускає власну незалежну LIVE-сесію — система розрахована на багато магазинів одночасно, кожен зі своїм ботом і чергою замовлень. Адмін-панель показує лог ефіру наживо через WebSocket, а з'єднання з TikTok автоматично відновлюється після обриву."
            bullets={[
              'Незалежна сесія на кожного продавця',
              'Живий лог коментарів і броней в адмін-панелі',
              'Автоматичне перепідключення при обриві ефіру',
            ]}
            accentClass="text-live"
            reverse
          />
        </section>

        {/* Pricing / early access */}
        <section id="pricing" className="band mt-24 scroll-mt-16">
          <div className="max-w-5xl mx-auto px-6 py-24">
            <Reveal>
              <SectionHeading
                icon={<Coins size={48} />}
                eyebrow="Ціна для перших користувачів"
                eyebrowClass="text-live"
                title={<>{PRICING.live.trialMonths} місяців безкоштовно, далі {PRICING.live.price} грн/міс</>}
                lede="Ми запускаємось і шукаємо перших продавців, які продають одяг у TikTok LIVE регулярно. Замість знижки на старті — умови, які лишаються з вами назавжди."
              />
            </Reveal>
            <StaggerGroup className="mt-12 grid sm:grid-cols-3 gap-6">
              {EARLY_ACCESS_PERKS.map((p) => (
                <StaggerItem key={p.t} className="h-full">
                  <div className="card-flat p-6 h-full">
                    <p.icon size={24} />
                    <h3 className="font-bold text-ink-strong mt-3">{p.t}</h3>
                    <p className="text-muted text-[15px] mt-2 leading-relaxed">{p.d}</p>
                  </div>
                </StaggerItem>
              ))}
            </StaggerGroup>
            <p className="text-muted text-xs mt-6 text-center">
              Умови раннього доступу діють для магазинів, підключених на період запуску.
            </p>
          </div>
        </section>

        {/* Coming soon */}
        <section className="max-w-6xl mx-auto px-6 py-24">
          <Reveal>
            <SectionHeading
              icon={<Sparkles size={48} />}
              eyebrow="Скоро"
              eyebrowClass="text-live"
              title="Що ми робимо далі — і що входить у ваш тариф"
            />
          </Reveal>
          <StaggerGroup className="mt-12 grid sm:grid-cols-3 gap-6">
            {COMING_SOON.map((f) => (
              <StaggerItem key={f.t} className="h-full">
                <div className="card p-6 h-full">
                  <div className="flex items-center justify-between">
                    <f.icon size={24} />
                    <span className="text-xs font-semibold text-muted bg-side rounded-full px-2.5 py-1">у планах</span>
                  </div>
                  <h3 className="font-bold text-ink-strong mt-4">{f.t}</h3>
                  <p className="text-muted text-[15px] mt-2 leading-relaxed">{f.d}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </section>

        {/* Who it's for */}
        <section className="band">
          <div className="max-w-4xl mx-auto px-6 py-24">
            <Reveal>
              <SectionHeading icon={<Users size={48} />} title="Для кого це" />
              <ul className="mt-12 grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
                {[
                  'Продаєте одяг у TikTok LIVE і ведете ефіри кілька разів на тиждень',
                  'Втомились вручну гортати директ у пошуках замовлень після ефіру',
                  'Хочете, щоб бронювання й дані покупця збирались самі, поки триває ефір',
                  'Відправляєте Новою Поштою і хочете автоматичний ТТН без ручного введення',
                ].map((t, i) => (
                  <li
                    key={t}
                    className={`card-flat flex items-start gap-3 text-[15px] text-body p-5 ${i % 2 === 1 ? 'sm:mt-6' : ''}`}
                  >
                    <Check size={20} className="text-live shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-3xl mx-auto px-6 py-24">
          <Reveal>
            <SectionHeading icon={<MessageCircle size={48} />} title="Питання, які запитують найчастіше" className="mb-10" />
          </Reveal>
          <Faq items={FAQ_ITEMS} />
        </section>

        {/* Cross-sell */}
        <section className="max-w-4xl mx-auto px-6 pb-20">
          <Reveal>
            <a href="/pos" className="card-link block p-8 text-center">
              <AppIcon size={64} className="mx-auto" />
              <p className="eyebrow text-pos mt-5">А ще</p>
              <h2 className="text-2xl font-bold text-ink-strong mt-1">Продаєш ще й офлайн?</h2>
              <p className="text-muted mt-3 max-w-lg mx-auto">
                POS каса від того ж LiveShop — з фіскалізацією ПРРО і режимом роботи без
                інтернету для магазину в залі. {PRICING.pos.label}.
              </p>
              <p className="link-more mt-4 text-[15px]">
                Переглянути POS <ChevronRight size={20} />
              </p>
            </a>
          </Reveal>
        </section>

        {/* Closing CTA */}
        <section className="max-w-3xl mx-auto px-6 pb-24">
          <CTAForm
            accent="live"
            heading="Готові спробувати на своєму ефірі?"
            subheading="Залиште ім'я і телефон — зателефонуємо і покажемо, як підключити."
            buttonLabel="Залишити заявку"
            showNameField
          />
        </section>
      </main>

      <StickyCta accent="live" label="Спробувати на своєму ефірі" href="#cta" heroRef={heroRef} />
      <Footer />
    </div>
  );
}
