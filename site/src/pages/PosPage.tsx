import { useRef } from 'react';
import { Nav } from '../components/Nav';
import { Footer } from '../components/Footer';
import { CTAForm } from '../components/CTAForm';
import { TwoColumnCompare } from '../components/TwoColumnCompare';
import { Faq } from '../components/Faq';
import { BrowserFrame } from '../components/BrowserFrame';
import { Reveal, StaggerGroup, StaggerItem } from '../components/Reveal';
import { DecorCircle } from '../components/DecorCircle';
import { StickyCta } from '../components/StickyCta';
import { useOsDetect, type DetectedOs } from '../hooks/useOsDetect';
import { JsonLd } from '../components/JsonLd';
import { FaqJsonLd } from '../components/FaqJsonLd';
import { ORGANIZATION_JSON_LD } from '../lib/organizationJsonLd';
import { useScrollToHash } from '../hooks/useScrollToHash';
import { ScanLine, Package, Users, Tag, Receipt, QrCode, BarChart3, Download, KeyRound, ShoppingCart } from 'lucide-react';
import posTerminalHero from '../assets/photo/pos-terminal-hero.jpg';
import posReceipt from '../assets/screenshots/pos-receipt.png';
import posRegisterMp4 from '../assets/video/pos-register-loop.mp4';
import posRegisterWebm from '../assets/video/pos-register-loop.webm';
import posRegisterPoster from '../assets/video/pos-register-poster.png';

const RELEASES_URL = 'https://github.com/merenkoff/tiktok-live/releases/latest';

const POS_SOFTWARE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'The Live Shop POS',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Windows, macOS, Linux',
  url: 'https://the-live.shop/pos',
  description:
    'Каса для магазину одягу — товари, штрихкоди, склад, знижки, QR-оплата, десктопний термінал з офлайн-режимом.',
  provider: { '@type': 'Organization', name: 'ТОВ «Технології»' },
};

const STATS = [
  { value: '0 мс', label: 'затримки офлайн — каса не чекає на сервер' },
  { value: 'PIN', label: 'вхід касира без пароля щоразу' },
  { value: 'GTIN', label: 'розпізнавання товару по штрихкоду' },
];

const FEATURES = [
  {
    t: 'Товари й штрихкоди',
    d: 'Скануєш штрихкод — система шукає товар у власній базі, а якщо його там ще немає, підвантажує назву й фото через GTIN-довідники. Пайплайн навчання запам\'ятовує підтверджені відповідності, тож наступного разу розпізнає точніше.',
    icon: ScanLine,
  },
  {
    t: 'Склад',
    d: 'Прихід, списання і коригування залишків оформлюються документами з проведенням і сторно — завжди видно, хто і коли змінив залишок. Система сама попереджає про товари на межі закінчення та веде довідник постачальників.',
    icon: Package,
  },
  {
    t: 'Персонал',
    d: 'Власник заходить по email і паролю в повний кабінет, продавець — за PIN-кодом одразу на касу. Ролі розділені: продавцю не потрібен доступ до налаштувань чи звітів.',
    icon: Users,
  },
  {
    t: 'Знижки та клієнти',
    d: 'Довідник клієнтів і знижки на чек або окремий товар — без стороннього CRM.',
    icon: Tag,
  },
  {
    t: 'Продажі',
    d: 'Завершення чека ідемпотентне: якщо касовий термінал повторить запит через збій мережі, продаж не задвоїться. Скасування і повернення — тут же, з касового екрана.',
    icon: Receipt,
  },
  {
    t: 'QR-оплата на касі',
    d: 'Динамічний QR-код через Opendatabot, оплата підтверджується вебхуком автоматично, а щоденна звірка перевіряє, що всі платежі знайшли свій чек.',
    icon: QrCode,
  },
  {
    t: 'Аналітика',
    d: 'Звіти з продажів по днях, середній чек і популярні товари — просто в кабінеті власника, без експорту в Excel.',
    icon: BarChart3,
  },
];

const GETTING_STARTED = [
  {
    n: '01',
    icon: Download,
    t: 'Завантажте й встановіть',
    d: 'Оберіть збірку під вашу ОС вище і встановіть застосунок — інсталятор запускається як звичайна програма.',
  },
  {
    n: '02',
    icon: KeyRound,
    t: 'Увійдіть один раз онлайн',
    d: 'Власник — по email і паролю, продавець — за PIN. Перший вхід потребує інтернету: каса знімає локальну копію каталогу й клієнтів, а сам PIN зберігається лише як PBKDF2-хеш, не у відкритому вигляді.',
  },
  {
    n: '03',
    icon: ShoppingCart,
    t: 'Продавайте — навіть офлайн',
    d: 'Далі каса працює з локальної копії: PIN перевіряється на пристрої, чеки пробиваються без затримки, а нові продажі стають у чергу на синхронізацію, щойно з\'явиться мережа.',
  },
];

const FAQ_ITEMS = [
  {
    q: 'Що станеться, якщо в магазині зникне інтернет посеред продажу?',
    a: 'Нічого — десктопна каса продовжує пробивати чеки з локальної копії каталогу, зберігає продажі в чергу і синхронізує їх, щойно мережа з\'явиться знову.',
  },
  {
    q: 'Як касир заходить у касу без інтернету?',
    a: 'PIN перевіряється локально на комп\'ютері касира через PBKDF2 — сам PIN у відкритому вигляді ніде не зберігається, лише його перевірочний хеш.',
  },
  {
    q: 'Що синхронізується першим після повернення мережі?',
    a: 'Спочатку клієнти, потім продажі — так дані про покупця встигають прив\'язатись до чека ще до того, як чек піде на сервер.',
  },
  {
    q: 'Чи можна почати без сканера штрихкодів?',
    a: 'Так, товари можна шукати за назвою чи додавати вручну — сканер лише пришвидшує процес і вмикає авто-розпізнавання по GTIN.',
  },
  {
    q: 'На яких пристроях працює десктопна каса?',
    a: 'Є нативні збірки під Windows, macOS та Linux — завантажуються нижче на цій сторінці.',
  },
  {
    q: 'Чим POS відрізняється від вебадмінки?',
    a: 'Вебадмінка — повний кабінет власника з будь-якого браузера, завжди онлайн. Десктопна каса — це саме той офлайн-стійкий термінал для прилавка в магазині.',
  },
  {
    q: 'Чи є в LiveShop POS фіскалізація чеків (ПРРО)?',
    a: 'Ні, наразі немає — інтеграція з ПРРО в розробці. Якщо фіскальний чек потрібен вам вже зараз, варто врахувати це при виборі каси.',
  },
  {
    q: 'Скільки коштує POS?',
    a: 'Залежить від кількості кас і магазинів — залиште номер телефону, і ми порахуємо разом.',
  },
];

function osLabel(os: DetectedOs): string | null {
  if (os === 'windows') return 'Windows';
  if (os === 'mac') return 'macOS';
  if (os === 'linux') return 'Linux';
  return null;
}

export function PosPage() {
  const os = useOsDetect();
  const heroRef = useRef<HTMLElement>(null);
  useScrollToHash();

  return (
    <div className="min-h-screen flex flex-col">
      <JsonLd data={ORGANIZATION_JSON_LD} />
      <JsonLd data={POS_SOFTWARE_JSON_LD} />
      <FaqJsonLd items={FAQ_ITEMS} />
      <Nav variant="pos" />

      <main className="flex-1">
        {/* Hero */}
        <section ref={heroRef} className="relative max-w-6xl mx-auto px-6 pt-16 pb-20 grid lg:grid-cols-2 gap-12 items-center">
          <DecorCircle
            colorClass="bg-pos/10"
            className="absolute -top-10 -left-16 w-72 h-72 sm:w-96 sm:h-96 -z-10"
          />
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-wide text-pos">Каса для офлайн-точки</p>
            <h1 className="text-6xl sm:text-7xl font-extrabold tracking-tighter mt-4 leading-[0.98]">
              Одна каса.
              <br />
              Онлайн і офлайн.
            </h1>
            <p className="text-muted text-lg mt-6 leading-relaxed">
              Товари, штрихкоди, склад, знижки та QR-оплата на касі — і десктопний термінал, який
              продовжує пробивати чеки, навіть якщо в магазині пропав інтернет.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#download" className="bg-pos hover:bg-pos-press transition-colors text-white text-sm font-semibold px-6 py-3.5 rounded-full">
                Завантажити POS
              </a>
              <a href="#cta" className="border border-line hover:border-ink transition-colors text-sm font-semibold px-6 py-3.5 rounded-full">
                Замовити демо
              </a>
            </div>
          </Reveal>
          <Reveal>
            <img
              src={posTerminalHero}
              alt="Каса LiveShop POS на терміналі — каталог товарів і кошик з реальним чеком"
              className="w-full h-auto rounded-2xl shadow-ambient"
            />
          </Reveal>
        </section>

        {/* Stat strip */}
        <section className="border-y border-line bg-mist">
          <div className="max-w-6xl mx-auto px-6 py-10 grid sm:grid-cols-3 gap-8 text-center">
            {STATS.map((s) => (
              <div key={s.label}>
                <p className="font-mono text-6xl md:text-7xl font-bold text-pos tracking-tight">{s.value}</p>
                <p className="text-muted text-sm mt-2">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Feature grid */}
        <section className="max-w-6xl mx-auto px-6 py-20">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl font-bold text-center max-w-xl mx-auto">Що всередині</h2>
          </Reveal>
          <StaggerGroup className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <StaggerItem key={f.t}>
                <div className="border border-line rounded-card p-6 h-full bg-paper transition-all duration-200 ease-out hover:-translate-y-1 hover:rotate-1 hover:shadow-lg hover:border-pos/30">
                  <div className="w-10 h-10 rounded-full bg-pos/5 grid place-items-center">
                    <f.icon className="w-5 h-5 text-pos" strokeWidth={1.75} />
                  </div>
                  <h3 className="font-bold mt-4">{f.t}</h3>
                  <p className="text-muted text-sm mt-2.5 leading-relaxed">{f.d}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>
          <Reveal className="mt-10">
            <BrowserFrame
              alt="Реальний запис роботи каси: додавання товарів, знижка, оплата"
              accentClass="border-pos/30"
              video={{ mp4: posRegisterMp4, webm: posRegisterWebm, poster: posRegisterPoster }}
            />
          </Reveal>
        </section>

        {/* Offline differentiator */}
        <section className="bg-ink text-white">
          <div className="max-w-5xl mx-auto px-6 py-20">
            <Reveal>
              <p className="text-sm font-semibold uppercase tracking-wide text-pos">Головна відмінність</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-3">
                Каса, яка не залежить від інтернету
              </h2>
              <p className="text-white/70 mt-5 max-w-2xl leading-relaxed">
                Десктопна каса на Tauri — єдина частина системи, розрахована на роботу офлайн. Це
                не «резервний режим на випадок збою», а те, як касир працює щодня в магазині зі
                слабким чи нестабільним інтернетом.
              </p>
              <ul className="mt-8 grid sm:grid-cols-2 gap-4 max-w-3xl">
                {[
                  'Знімає локальну копію каталогу товарів і клієнтів при першому вході в мережі',
                  'Перевіряє PIN касира локально через PBKDF2 — без запиту на сервер',
                  'Ставить нові продажі й клієнтів у чергу, поки немає з\'єднання',
                  'Синхронізує чергу автоматично, щойно мережа з\'явиться — спершу клієнтів, потім продажі',
                ].map((t, i) => (
                  <li
                    key={t}
                    className={`flex items-start gap-3 text-sm text-white/90 bg-white/5 border border-white/10 rounded-card p-4 ${
                      i % 2 === 1 ? 'sm:mt-6' : ''
                    }`}
                  >
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-pos shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* Web vs desktop */}
        <section className="max-w-6xl mx-auto px-6 py-20">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl font-bold text-center max-w-xl mx-auto mb-10">
              Веб-адмінка чи десктоп-каса?
            </h2>
          </Reveal>
          <TwoColumnCompare
            accentClass="text-pos"
            left={{
              title: 'Веб-адмінка',
              points: [
                'Відкривається в будь-якому браузері',
                'Повний кабінет власника: звіти, склад, персонал',
                'Потребує стабільного інтернету',
              ],
            }}
            right={{
              title: 'Десктоп-каса (Tauri)',
              points: [
                'Нативний застосунок для Windows / macOS / Linux',
                'Продовжує продавати без інтернету',
                'Для прилавка в торговій точці',
              ],
            }}
          />
        </section>

        {/* Downloads */}
        <section id="download" className="bg-mist border-y border-line">
          <div className="max-w-5xl mx-auto px-6 py-20">
            <Reveal>
              <h2 className="text-2xl sm:text-3xl font-bold text-center">Завантажити POS</h2>
              <p className="text-muted text-center mt-3 max-w-lg mx-auto">
                Десктопна каса для торгової точки — оберіть свою систему.
              </p>
            </Reveal>
            <div className="mt-10 grid sm:grid-cols-3 gap-6">
              {[
                { key: 'windows', icon: '🪟', name: 'Windows', meta: 'Windows 10/11, 64-біт' },
                { key: 'mac', icon: '🍎', name: 'macOS', meta: 'macOS 11+, Intel і Apple Silicon' },
                { key: 'linux', icon: '🐧', name: 'Linux', meta: 'AppImage / .deb' },
              ].map((card) => (
                <Reveal key={card.key}>
                  <div
                    className={`border rounded-card p-6 text-center bg-paper h-full flex flex-col ${
                      os === card.key
                        ? 'border-pos shadow-lg'
                        : 'border-line transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-lg'
                    }`}
                  >
                    {os === card.key && (
                      <span className="text-[11px] font-semibold text-pos mb-2">
                        Рекомендовано для твоєї ОС
                      </span>
                    )}
                    <div className="text-4xl">{card.icon}</div>
                    <p className="font-bold mt-2">{card.name}</p>
                    <p className="text-muted text-xs mt-1">{card.meta}</p>
                    <a
                      href={RELEASES_URL}
                      className="mt-5 bg-pos hover:bg-pos-press transition-colors text-white text-sm font-semibold py-3 rounded-full"
                    >
                      Завантажити
                    </a>
                  </div>
                </Reveal>
              ))}
            </div>
            {osLabel(os) && (
              <p className="text-center text-muted text-sm mt-6">
                Визначили вашу систему як {osLabel(os)} — рекомендована збірка виділена вище.
              </p>
            )}
          </div>
        </section>

        {/* Getting started */}
        <section className="max-w-6xl mx-auto px-6 py-20">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl font-bold text-center max-w-xl mx-auto">Як почати</h2>
            <p className="text-muted text-center mt-3">Від встановлення до першого чека — три кроки.</p>
          </Reveal>
          <div className="mt-12 grid sm:grid-cols-3 gap-8">
            {GETTING_STARTED.map((s) => (
              <Reveal key={s.n}>
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-pos font-extrabold text-sm">{s.n}</span>
                    <div className="w-9 h-9 rounded-full bg-pos/5 grid place-items-center">
                      <s.icon className="w-4 h-4 text-pos" strokeWidth={1.75} />
                    </div>
                  </div>
                  <h3 className="font-bold mt-4">{s.t}</h3>
                  <p className="text-muted text-sm mt-2.5 leading-relaxed">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Receipt visual + FAQ */}
        <section className="max-w-6xl mx-auto px-6 py-20 grid lg:grid-cols-2 gap-16 items-start">
          <Reveal>
            <BrowserFrame src={posReceipt} alt="Екран успішного продажу з номером чека" accentClass="border-pos/30" />
          </Reveal>
          <Reveal>
            <h2 className="text-2xl sm:text-3xl font-bold mb-8">Питання, які запитують найчастіше</h2>
            <Faq items={FAQ_ITEMS} />
            <p className="text-sm text-muted mt-6">
              Порівнюєте з іншими касами?{' '}
              <a href="/yaku-kasu-obraty" className="text-pos font-semibold">
                Дивіться чесне порівняння →
              </a>
            </p>
          </Reveal>
        </section>

        {/* Closing CTA */}
        <section className="max-w-3xl mx-auto px-6 pb-24">
          <CTAForm
            id="cta"
            accent="pos"
            heading="Готові підключити касу?"
            subheading="Залиште ім'я і телефон — допоможемо налаштувати під ваш магазин."
            buttonLabel="Замовити демо"
            showNameField
          />
        </section>
      </main>

      <StickyCta accent="pos" label="Завантажити POS" href="#download" heroRef={heroRef} />
      <Footer />
    </div>
  );
}
