import { useRef } from 'react';
import { Nav } from '../components/Nav';
import { Footer } from '../components/Footer';
import { CTAForm } from '../components/CTAForm';
import { TwoColumnCompare } from '../components/TwoColumnCompare';
import { Faq } from '../components/Faq';
import { BrowserFrame } from '../components/BrowserFrame';
import { Reveal, StaggerGroup, StaggerItem } from '../components/Reveal';
import { AppIcon } from '../components/AppIcon';
import { SectionHeading } from '../components/SectionHeading';
import { VerticalsMark } from '../components/VerticalsMark';
import { StickyCta } from '../components/StickyCta';
import { VerticalCards } from '../components/VerticalCards';
import { PricingSection, checkboxComparison } from '../components/PricingSection';
import { Roadmap } from '../components/Roadmap';
import { useOsDetect, type DetectedOs } from '../hooks/useOsDetect';
import { useScrollToHash } from '../hooks/useScrollToHash';
import { PRODUCT, PRICING, RELEASES_URL, FEATURES, VERTICALS, isAvailable, ROADMAP } from '../lib/productFacts';
import { track } from '../lib/analytics';
import type { FaqItem } from '../lib/faqJsonLd';
import {
  BarChart3,
  ChevronRight,
  ClipboardCheck,
  Download,
  KeyRound,
  Laptop,
  MessageCircle,
  Monitor,
  Package,
  QrCode,
  Receipt,
  ScanLine,
  ShieldCheck,
  ShoppingCart,
  Star,
  Tag,
  Terminal,
  Users,
  WifiOff,
} from '../components/glyphs';
import posTerminalHero from '../assets/photo/pos-terminal-hero.jpg';
import posDevicesReceipt from '../assets/photo/pos-devices-receipt.png';
import posRegisterMp4 from '../assets/video/pos-register-loop.mp4';
import posRegisterWebm from '../assets/video/pos-register-loop.webm';
import posRegisterPoster from '../assets/video/pos-register-poster.png';

const HANDOVER_ARTICLE = '/dovidka/zmina-prro-zamina-kasy';
const ROADMAP_POS = ROADMAP.filter((item) => item.vertical === 'pos');

const STATS = [
  { value: '0 мс', label: 'затримки офлайн — каса не чекає на сервер' },
  { value: 'ПРРО', label: 'фіскальний чек через Checkbox, онлайн і офлайн' },
  { value: 'GTIN', label: 'розпізнавання товару по штрихкоду' },
];

const FEATURE_CARDS = [
  {
    t: 'Фіскалізація (ПРРО)',
    d: 'Фіскальний чек через Checkbox — зміни, Z-звіт і QR-код для перевірки друкуються на чековому принтері. Без інтернету каса пробиває офлайн-чеки з резерву фіскальних кодів і відправляє їх у ДПС, щойно з\'явиться мережа.',
    icon: ShieldCheck,
  },
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
    t: 'Інвентаризація на касі',
    d: 'Продавець рахує товар сканером просто на касі — навіть без інтернету. Лист підрахунку відправляється на сервер, щойно з\'явиться мережа, і чекає на проведення власником у «Складі».',
    icon: ClipboardCheck,
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

const FISCAL_POINTS = [
  FEATURES.fiscalOnlineCheckbox.label,
  FEATURES.fiscalReceiptPrint.label,
  FEATURES.fiscalOffline.label,
  FEATURES.tillHandover.label,
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

export const FAQ_ITEMS: FaqItem[] = [
  {
    q: `Чи є в ${PRODUCT.pos.name} фіскалізація чеків (ПРРО)?`,
    a: 'Так. Фіскалізація працює через Checkbox: каса відкриває і закриває зміни, формує Z-звіт, а фіскальний чек із QR-кодом для перевірки друкується на чековому принтері. Без інтернету каса пробиває офлайн-чеки з резерву фіскальних кодів і відправляє їх у ДПС, щойно мережа повернеться.',
  },
  {
    q: 'Що станеться, якщо в магазині зникне інтернет посеред продажу?',
    a: 'Нічого — десктопна каса продовжує пробивати чеки з локальної копії каталогу, зберігає продажі в чергу і синхронізує їх, щойно мережа з\'явиться знову. Фіскальні чеки в цей час отримують номери з резерву офлайн-кодів.',
  },
  {
    q: 'Що робити, якщо комп\'ютер із касою зламався посеред зміни?',
    a: 'Зміна ПРРО належить реєстратору, а не комп\'ютеру, тому закривати її не потрібно. На іншому комп\'ютері касир запитує передачу каси, попередній пристрій підтверджує — і зміна продовжується без другого Z-звіту. Якщо старий комп\'ютер не відповідає, власник забирає касу примусово.',
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
    q: 'Чи підходить каса для кафе чи ресторану?',
    a: 'Так. Вертикаль «кафе» дає модифікатори, номер замовлення на чеку, дошку кухні й бару зі стоп-листом, техкарти з фудкостом і матрицю меню; модуль столів додає план залу, рахунки столів, раунди на кухню, передчек і розділення рахунку. Докладно — на сторінках /pos/kafe і /pos/restoran.',
  },
  {
    q: 'Чи можна вести квіткову крамницю?',
    a: 'Так. Вертикаль «квіти» має стіл флориста, який рахує букет по стеблах з роботою флориста, вітрину з власними цінниками, передзамовлення на дату й аналітику списань. Докладно — на /pos/kvity.',
  },
  {
    q: 'Скільки коштує POS?',
    a: PRICING.pos.detail,
  },
  {
    q: 'Чи треба платити наперед, щоб зафіксувати ціну?',
    a: `Ні. ${checkboxComparison()}`,
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
      <Nav variant="pos" />

      <main className="flex-1">
        {/* Hero — the Things layout: the app icon, the name, one paragraph, one button. */}
        <section ref={heroRef} className="max-w-6xl mx-auto px-6 pt-16 sm:pt-20 text-center">
          <Reveal className="flex flex-col items-center">
            <AppIcon size={144} className="drop-shadow-[0_14px_24px_rgba(0,30,80,0.22)]" />
            <p className="eyebrow text-pos mt-8">Одна каса для чотирьох бізнесів</p>
            <h1 className="h-display mt-3">
              Одна каса.
              <br />
              Онлайн і офлайн.
            </h1>
            <p className="lede mt-6 max-w-2xl">
              Для магазину одягу, квіткової крамниці, кав'ярні й ресторану. Товари, штрихкоди,
              склад, знижки, QR-оплата і фіскальний чек ПРРО — і десктопний термінал, який
              продовжує пробивати чеки, навіть якщо в залі пропав інтернет.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
              <a href="#download" className="btn-pos">
                Завантажити POS
              </a>
              <a href="#cta" className="link-more text-[17px]">
                Замовити демо <ChevronRight size={20} />
              </a>
            </div>
            <p className="text-sm text-muted mt-5">{PRICING.pos.label}.</p>
          </Reveal>
          <Reveal className="mt-14">
            <img
              src={posTerminalHero}
              alt={`Каса ${PRODUCT.pos.name} на терміналі — каталог товарів і кошик з реальним чеком`}
              className="w-full max-w-5xl mx-auto h-auto rounded-card shadow-ambient"
            />
          </Reveal>
        </section>

        {/* Stat strip */}
        <section className="max-w-6xl mx-auto px-6 pt-16">
          <div className="grid sm:grid-cols-3 gap-6 text-center">
            {STATS.map((s) => (
              <div key={s.label} className="card px-6 py-8">
                <p className="text-5xl md:text-6xl font-bold text-pos tracking-tight tabular-nums">{s.value}</p>
                <p className="text-muted text-[15px] mt-2">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Verticals */}
        <section id="verticals" className="max-w-6xl mx-auto px-6 py-24 scroll-mt-16">
          <Reveal>
            <SectionHeading
              icon={<VerticalsMark size={64} />}
              title="Для якого бізнесу"
              lede={
                <>
                  Що продає магазин, вирішує, як виглядає екран продажу:{' '}
                  {VERTICALS.map((v) => v.title.toLowerCase()).join(', ')}. Решта каси — спільна.
                </>
              }
            />
          </Reveal>
          <div className="mt-12">
            <VerticalCards />
          </div>
        </section>

        {/* Feature grid */}
        <section className="max-w-6xl mx-auto px-6 pb-24">
          <Reveal>
            <SectionHeading icon={<Package size={48} />} title="Що всередині" lede="Спільне ядро для всіх вертикалей." />
          </Reveal>
          <StaggerGroup className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURE_CARDS.map((f) => (
              <StaggerItem key={f.t} className="h-full">
                <div className="card p-7 h-full">
                  <f.icon size={24} />
                  <h3 className="text-lg font-bold text-ink-strong mt-3">{f.t}</h3>
                  <p className="text-muted text-[15px] mt-2 leading-relaxed">{f.d}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerGroup>
          <Reveal className="mt-12">
            <BrowserFrame
              alt="Реальний запис роботи каси: додавання товарів, знижка, оплата"
              video={{ mp4: posRegisterMp4, webm: posRegisterWebm, poster: posRegisterPoster }}
              elevated
            />
          </Reveal>
        </section>

        {/* Offline differentiator */}
        <section className="band">
          <div className="max-w-5xl mx-auto px-6 py-24">
            <Reveal>
              <SectionHeading
                icon={<WifiOff size={48} />}
                eyebrow="Головна відмінність"
                title="Каса, яка не залежить від інтернету"
                lede="Десктопна каса на Tauri — єдина частина системи, розрахована на роботу офлайн. Це не «резервний режим на випадок збою», а те, як касир працює щодня в магазині зі слабким чи нестабільним інтернетом."
              />
              <ul className="mt-12 grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
                {[
                  'Знімає локальну копію каталогу товарів і клієнтів при першому вході в мережі',
                  'Перевіряє PIN касира локально через PBKDF2 — без запиту на сервер',
                  'Ставить нові продажі й клієнтів у чергу, поки немає з\'єднання',
                  'Синхронізує чергу автоматично, щойно мережа з\'явиться — спершу клієнтів, потім продажі',
                ].map((t) => (
                  <li key={t} className="card-flat flex items-start gap-3 text-[15px] text-body p-5">
                    <ChevronRight size={20} className="text-pos shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* Fiscal */}
        <section id="prro" className="max-w-6xl mx-auto px-6 py-24 grid lg:grid-cols-2 gap-12 items-start scroll-mt-16">
          <Reveal>
            <SectionHeading
              align="left"
              icon={<ShieldCheck size={48} />}
              eyebrow="Фіскалізація"
              title="ПРРО без окремої програми"
              lede="Фіскальний чек формується прямо з каси через Checkbox — окремий застосунок для ПРРО не потрібен. Зміна належить фіскальному реєстратору, а не комп'ютеру: якщо каса зламалась посеред дня, її передають на інший пристрій без другого Z-звіту."
            />
            <a href={HANDOVER_ARTICLE} className="link-more text-[15px] mt-6">
              Як саме це працює — у довідці про зміну ПРРО і заміну каси <ChevronRight size={20} />
            </a>
          </Reveal>
          <Reveal>
            <ul className="card divide-y divide-line">
              {FISCAL_POINTS.map((t) => (
                <li key={t} className="flex items-start gap-3 text-[15px] text-body px-6 py-4">
                  <ShieldCheck size={24} className="shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
            {!isAvailable('fiscalOffline') && (
              <p className="text-xs text-muted mt-3">Офлайн-режим ПРРО — у розробці.</p>
            )}
          </Reveal>
        </section>

        {/* Web vs desktop */}
        <section className="max-w-6xl mx-auto px-6 pb-24">
          <Reveal>
            <SectionHeading icon={<Monitor size={48} />} title="Веб-адмінка чи десктоп-каса?" className="mb-12" />
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

        <PricingSection />

        <Roadmap
          items={ROADMAP_POS}
          title="Що ми робимо далі — і що входить у ваш тариф"
          lede="Спільне для всіх вертикалей. Те, що стосується лише квітів, кафе чи столів, — на їхніх сторінках."
        />

        {/* Downloads */}
        <section id="download" className="band scroll-mt-16">
          <div className="max-w-5xl mx-auto px-6 py-24">
            <Reveal>
              <SectionHeading
                icon={<Download size={48} />}
                title="Завантажити POS"
                lede={<>Десктопна каса для торгової точки — оберіть свою систему. {PRICING.pos.launch.label}.</>}
              />
            </Reveal>
            <div className="mt-12 grid sm:grid-cols-3 gap-6">
              {[
                { key: 'windows', icon: Monitor, name: 'Windows', meta: 'Windows 10/11, 64-біт' },
                { key: 'mac', icon: Laptop, name: 'macOS', meta: 'macOS 11+, Intel і Apple Silicon' },
                { key: 'linux', icon: Terminal, name: 'Linux', meta: 'AppImage / .deb' },
              ].map((card) => (
                <Reveal key={card.key} className="h-full">
                  <div
                    className={`card-flat p-6 text-center h-full flex flex-col items-center ${
                      os === card.key ? 'ring-2 ring-pos' : ''
                    }`}
                  >
                    <span className={`text-xs font-semibold mb-3 ${os === card.key ? 'text-pos' : 'invisible'}`}>
                      Рекомендовано для твоєї ОС
                    </span>
                    <card.icon size={48} />
                    <p className="text-lg font-bold text-ink-strong mt-3">{card.name}</p>
                    <p className="text-muted text-sm mt-1">{card.meta}</p>
                    <a
                      href={RELEASES_URL}
                      onClick={() => track('download_click', { os: card.key })}
                      className="btn-pos mt-6 self-stretch"
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
        <section className="max-w-6xl mx-auto px-6 py-24">
          <Reveal>
            <SectionHeading icon={<Star size={48} />} title="Як почати" lede="Від встановлення до першого чека — три кроки." />
          </Reveal>
          <div className="mt-12 grid sm:grid-cols-3 gap-6">
            {GETTING_STARTED.map((s) => (
              <Reveal key={s.n} className="h-full">
                <div className="card p-7 h-full">
                  <div className="flex items-center justify-between">
                    <s.icon size={24} />
                    <span className="text-[13px] font-semibold text-faint tabular-nums">{s.n}</span>
                  </div>
                  <h3 className="text-lg font-bold text-ink-strong mt-3">{s.t}</h3>
                  <p className="text-muted text-[15px] mt-2 leading-relaxed">{s.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Receipt visual + FAQ */}
        <section className="max-w-6xl mx-auto px-6 pb-24 grid lg:grid-cols-2 gap-16 items-start">
          <Reveal>
            <img
              src={posDevicesReceipt}
              alt={`Звіти з продажів ${PRODUCT.pos.name} на ноутбуці і чек на телефоні`}
              className="w-full h-auto rounded-card shadow-ambient"
            />
          </Reveal>
          <Reveal>
            <SectionHeading align="left" icon={<MessageCircle size={48} />} title="Питання, які запитують найчастіше" className="mb-8" />
            <Faq items={FAQ_ITEMS} />
            <a href="/yaku-kasu-obraty" className="link-more text-[15px] mt-6">
              Порівнюєте з іншими касами? Дивіться чесне порівняння <ChevronRight size={20} />
            </a>
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
