import { useRef } from 'react';
import { Nav } from '../components/Nav';
import { Footer } from '../components/Footer';
import { CTAForm } from '../components/CTAForm';
import { FeatureRow } from '../components/FeatureRow';
import { TwoColumnCompare } from '../components/TwoColumnCompare';
import { Faq } from '../components/Faq';
import { BrowserFrame } from '../components/BrowserFrame';
import { TelegramChatMockup } from '../components/TelegramChatMockup';
import { Reveal } from '../components/Reveal';
import { StickyCta } from '../components/StickyCta';
import liveScreenshot from '../assets/screenshots/live-session.png';

const STATS = [
  { value: '3 мови', label: 'розпізнає коментарі — EN, UK, RU' },
  { value: '~5 хв', label: 'тримає бронь на товар' },
  { value: '24/7', label: 'бот приймає дані покупця' },
];

const FAQ_ITEMS = [
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
    a: 'Так — адмін-панель показує потік коментарів, броней і помилок наживо через WebSocket, без оновлення сторінки.',
  },
  {
    q: 'Скільки це коштує?',
    a: 'Залежить від масштабу продажів — залиште номер телефону нижче, і ми порахуємо разом.',
  },
];

export function LivePage() {
  const heroRef = useRef<HTMLElement>(null);

  return (
    <div className="min-h-screen flex flex-col">
      <Nav variant="live" />

      <main className="flex-1">
        {/* Hero */}
        <section ref={heroRef} className="max-w-6xl mx-auto px-6 pt-16 pb-20 grid lg:grid-cols-2 gap-12 items-center">
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-wide text-live">
              Операційна система для TikTok LIVE
            </p>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mt-4 leading-[1.05]">
              Продавай у ефірі,
              <br />
              не в хаосі
            </h1>
            <p className="text-muted text-lg mt-6 leading-relaxed">
              Коментар → бронь → Telegram. Поки ти показуєш наступну модель одягу, попередні
              замовлення вже зібрані, а бот питає в покупця ім'я, телефон і відділення Нової
              Пошти — без твоєї участі.
            </p>
            <div className="mt-8">
              <CTAForm
                id="cta"
                accent="live"
                heading="Спробувати на своєму ефірі"
                subheading="Залиште номер — покажемо, як це працює на прикладі вашого магазину."
                buttonLabel="Хочу демо"
              />
            </div>
          </Reveal>
          <Reveal>
            <div className="space-y-6">
              <BrowserFrame src={liveScreenshot} alt="Панель керування LIVE-сесією зі статистикою ефіру" dark accentClass="border-live/30" />
              <TelegramChatMockup />
            </div>
          </Reveal>
        </section>

        {/* Stat strip */}
        <section className="border-y border-line bg-mist">
          <div className="max-w-6xl mx-auto px-6 py-10 grid sm:grid-cols-3 gap-8 text-center">
            {STATS.map((s) => (
              <div key={s.label}>
                <p className="text-3xl font-extrabold text-live">{s.value}</p>
                <p className="text-muted text-sm mt-1.5">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Before/after */}
        <section className="max-w-6xl mx-auto px-6 py-20">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl font-bold text-center max-w-xl mx-auto">
              До і після LiveShop
            </h2>
          </Reveal>
          <div className="mt-10">
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
        <section className="bg-mist border-y border-line">
          <div className="max-w-4xl mx-auto px-6 py-20">
            <Reveal>
              <h2 className="text-2xl sm:text-3xl font-bold text-center">Як це виглядає в ефірі</h2>
            </Reveal>
            <div className="mt-12 grid sm:grid-cols-3 gap-8">
              {[
                { n: '1', t: 'Коментар', d: 'Глядач пише «A12 104» або «хочу A12» у чаті ефіру.' },
                { n: '2', t: 'Бронь', d: 'Товар резервується на ім\'я глядача на кілька хвилин.' },
                { n: '3', t: 'Telegram', d: 'Бот у приватних повідомленнях збирає дані на доставку.' },
              ].map((s) => (
                <Reveal key={s.n}>
                  <div className="text-center">
                    <div className="w-10 h-10 rounded-full bg-live text-white font-bold grid place-items-center mx-auto">
                      {s.n}
                    </div>
                    <h3 className="font-bold mt-4">{s.t}</h3>
                    <p className="text-muted text-sm mt-2 leading-relaxed">{s.d}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Feature narrative */}
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

        {/* Who it's for */}
        <section className="bg-mist border-y border-line">
          <div className="max-w-4xl mx-auto px-6 py-20">
            <Reveal>
              <h2 className="text-2xl sm:text-3xl font-bold text-center">Для кого це</h2>
              <ul className="mt-8 grid sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
                {[
                  'Продаєте одяг у TikTok LIVE і ведете ефіри кілька разів на тиждень',
                  'Втомились вручну гортати директ у пошуках замовлень після ефіру',
                  'Хочете, щоб бронювання й дані покупця збирались самі, поки триває ефір',
                  'Відправляєте Новою Поштою і хочете автоматичний ТТН без ручного введення',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-sm bg-paper border border-line rounded-card p-4">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-live shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-3xl mx-auto px-6 py-20">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10">Питання, які запитують найчастіше</h2>
          </Reveal>
          <Faq items={FAQ_ITEMS} />
        </section>

        {/* Cross-sell */}
        <section className="max-w-4xl mx-auto px-6 pb-20">
          <Reveal>
            <a
              href="/pos"
              className="block rounded-card border border-line bg-pos/5 hover:bg-pos/10 transition-colors p-8 text-center"
            >
              <p className="text-sm font-semibold uppercase tracking-wide text-pos">А ще</p>
              <h3 className="text-2xl font-extrabold mt-2">Продаєш ще й офлайн?</h3>
              <p className="text-muted mt-3 max-w-lg mx-auto">
                POS каса від того ж LiveShop — з режимом роботи без інтернету для магазину в
                залі.
              </p>
              <p className="mt-4 text-sm font-semibold text-pos">Переглянути POS →</p>
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
