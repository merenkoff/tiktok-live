import type { Article } from './types';
import { COMPETITOR_FACTS, FEATURES, PRICING, PRODUCT, VERTICALS, isAvailable, roadmapFor } from '../../lib/productFacts';
import { formatDateUk } from '../../lib/formatDate';

const POS = PRODUCT.pos.name;
const T = COMPETITOR_FACTS.torgsoft;
const PB = COMPETITOR_FACTS.posbox;
const P = COMPETITOR_FACTS.posterretail;
const CB = COMPETITOR_FACTS.checkbox;
const GROCERY = VERTICALS.find((v) => v.id === 'grocery');
/**
 * The landing this article feeds. «Під запис» works since 2026-10-24 (the
 * `debts` module, in any store) and weighed goods since phase Г4, when the
 * landing left «Скоро». Our till still stays out of the comparison tables — a
 * comparison of three programs by their own pages: what it does today and
 * what is coming is the last section, read from FEATURES and ROADMAP.
 */
const LANDING = GROCERY?.path ?? '/pos/produkty';

/** All three were read on the same day; every figure below comes from COMPETITOR_FACTS. */
const CHECKED = formatDateUk(T.checkedAt);
/** «17 990»: grouped by hand, because a locale's separator differs between Node and a browser and would break hydration. */
const uah = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const START = T.licences.find((l) => l.id === 'Старт')!;
const ULTRA = T.licences.find((l) => l.id === 'Ультра')!;
/** «Ультра й Термінал» — the licences that carry the debt mode. */
const DEBT_LICENCES = T.licences
  .filter((l) => l.debts)
  .map((l) => l.id)
  .join(' й ');
const T_SCALES = `${T.scaleBrands.slice(0, 5).join(', ')} та інші`;

const PB_START = PB.plans.find((p) => p.id === 'Start')!;
const PB_BUSINESS = PB.plans.find((p) => p.id === 'Business')!;
const PB_PRO = PB.plans.find((p) => p.id === 'Pro')!;
/** The tariff page calculator's rule: goods above those in the price are paid per thousand begun. */
const pbGoods = (items: number) => Math.ceil(Math.max(items - PB.goodsIncluded, 0) / PB.goodsStep) * PB.goodsStepUah;

const P_STOCKTAKE_FROM = P.plans.find((p) => p.stocktake)!.id;
const P_ITEMS = P.plans.map((p) => uah(p.items)).join(' / ');

// The worked example: a shop by the house with one till, up to ITEMS goods,
// a scale at the till and a fiscal receipt. Equipment, setup and SMS are left out.
const ITEMS = 1000;
/** Торгсофт's yearly part of the example: ПРРО and the till scale, each bought per device. */
const T_YEAR = T.prroYearUah + T.tillScalesYearUah;
const tFirst = (l: { perpetualUah: number }) => l.perpetualUah + T_YEAR;
const tThree = (l: { perpetualUah: number }) => l.perpetualUah + 3 * T_YEAR;
const tRent = (l: { yearUah: number }) => l.yearUah + T_YEAR;
const PB_MONTH = PB_BUSINESS.monthlyUah + pbGoods(ITEMS);
/** Poster: the cheapest tariff whose catalogue holds the goods, plus its ПРРО. */
const P_PLAN = P.plans.find((p) => p.items >= ITEMS)!;
const P_NEXT = P.plans.find((p) => p.items > ITEMS)!;
const P_MONTH = P_PLAN.monthlyUah + P.prroUah;
const P_ANNUAL = P_PLAN.annualUah + P.prroUah;

const SOURCES = {
  /** Закон № 265/95-ВР, ст. 5 — the offline limits; read on the same day, ред. від 26.06.2026. */
  rroLaw: 'https://zakon.rada.gov.ua/laws/show/265/95-%D0%B2%D1%80',
} as const;

export const torgsoftPosboxPosterDlyaProduktovogoMagazynu: Article = {
  meta: {
    slug: 'torgsoft-posbox-poster-dlya-produktovogo-magazynu',
    kind: 'article',
    eyebrow: 'Порівняння',
    title: 'Програма для продуктового магазину: Торгсофт, Posbox чи Poster — продаж у борг, ваги й ціна',
    description: `Що вміють Торгсофт, Posbox і Poster для продуктового магазину: продаж у борг і облік боргів покупців, ваги на касі й ваги з друком етикеток, робота без інтернету, ПРРО — і скільки коштує каса на одну точку за рік і за три роки. За сторінками виробників, прочитаними ${CHECKED}.`,
    publishedAt: T.publishedAt,
    updatedAt: T.checkedAt,
    ogImage: '/og/pos.png',
    readingMinutes: 8,
    cta: {
      heading: 'Хочете касу з продажем під запис і ваговим товаром?',
      subheading: `Продаж під запис і ваговий товар у ${POS} уже працюють. Залиште телефон: підключимо під запис, покажемо касу на прикладі вашого магазину і спитаємо, чого вам бракує в програмі, з якою ви працюєте зараз.`,
      button: 'Замовити демо',
      intent: 'demo',
    },
    faq: [
      {
        q: 'Яку програму обрати для продуктового магазину?',
        a: `Ту, що проходить ваш звичайний день: фасований товар сканером, ваговий — з ваг, борг постійного покупця, фіскальний чек ПРРО і продаж, коли зникло світло. За сторінками виробників, ваги підключаються до всіх трьох — Торгсофт, Posbox і Poster; продаж у борг прямо описує лише Торгсофт, у версіях ${DEBT_LICENCES}; про продаж без інтернету пишуть Торгсофт і Poster. Posbox — підписка, у ціну якої вже входить ПРРО Checkbox: ${PB_BUSINESS.monthlyUah} ₴/міс за тариф ${PB_BUSINESS.id} зі складом. Перевірте свій сценарій на демо кожної.`,
      },
      {
        q: 'Яка програма для магазину вміє продаж у борг?',
        a: `З трьох — Торгсофт: у версіях ${DEBT_LICENCES} покупцю ставлять позначку «VIP-клієнт», і він може брати товар у борг; власник задає максимальну суму боргу, понад яку програма продати в борг не дасть, а «Картка взаєморозрахунків» слугує актом звірки. У Торгсофт-Старт, за їхньою ж сторінкою, «режим продажу в борг відсутній». Нагадування боржникам — опцією «Масові розсилки клієнтам» за ${uah(T.mailingsYearUah)} грн на рік. На сторінках Posbox і Poster, які ми прочитали ${CHECKED}, продажу в борг не згадано. У ${POS} продаж під запис уже працює — у будь-якому магазині, де підключено модуль «Борги»: ліміт на покупця, погашення частинами, фіскальний чек при оплаті.`,
      },
      {
        q: 'Скільки коштує Торгсофт для продуктового магазину?',
        a: `Ліцензія на одне робоче місце: Торгсофт-Старт — ${uah(START.perpetualUah)} грн один раз або ${uah(START.yearUah)} грн за рік оренди, Торгсофт-Ультра — ${uah(ULTRA.perpetualUah)} грн або ${uah(ULTRA.yearUah)} грн за рік. Окремо, щороку й на кожен пристрій: програмний РРО — ${uah(T.prroYearUah)} грн, ваги на касі — ${uah(T.tillScalesYearUah)} грн, ваги з друком етикеток — ${uah(T.labelScalesYearUah)} грн. Каса Старт із ПРРО й вагами на касі виходить ${uah(tFirst(START))} грн за перший рік і ${uah(T_YEAR)} грн за кожен наступний. Програма встановлюється на комп'ютер з Windows.`,
      },
      {
        q: 'Скільки коштує Posbox?',
        a: `За сторінкою тарифів Posbox (${CHECKED}): ${PB_START.id} — ${PB_START.monthlyUah} ₴/міс з позначкою «Тільки для клієнтів Checkbox», до ${PB.startGoodsLimit} товарів і без складського обліку; ${PB_BUSINESS.id} — ${PB_BUSINESS.monthlyUah} ₴/міс; ${PB_PRO.id} — ${PB_PRO.monthlyUah} ₴/міс; перший місяць безкоштовно. У ціну входять одна торгова точка, одна каса й ПРРО Checkbox. У ${PB_BUSINESS.id} і ${PB_PRO.id} ${PB.goodsIncluded} товарів — у ціні, кожна наступна тисяча — ще ${PB.goodsStepUah} ₴/міс, додаткова каса — ${PB.extraRegisterUah} ₴, торгова точка — ${PB.extraOutletUah} ₴.`,
      },
      {
        q: 'Скільки коштує Poster для магазину?',
        a: `За сторінкою тарифів Poster для магазинів (${CHECKED}): ${P.plans
          .map((p) => `${p.id} — ${uah(p.monthlyUah)} ₴/міс (${uah(p.annualUah)} ₴/міс при оплаті за рік), до ${uah(p.items)} товарів`)
          .join('; ')}. ПРРО — ще ${P.prroUah} ₴/міс за касу в будь-якому тарифі. Одна каса входить у тариф, додаткову можна взяти з тарифу ${P.extraRegisterFrom} — ${P.extraRegisterUah} ₴. Перші ${P.trialDays} днів безкоштовно.`,
      },
      {
        q: 'Чи можна підключити ваги до програми для магазину?',
        a: `Так, до всіх трьох. У Торгсофт це річні опції на кожен пристрій: ваги на касі — ${uah(T.tillScalesYearUah)} грн, ваги з друком етикеток — ${uah(T.labelScalesYearUah)} грн. Posbox працює з вагами ${PB.scaleBrands.join(', ')} і читає ваговий штрихкод наліпки з префіксами ${PB.weightBarcodePrefixes.join(', ')}. У Poster інтеграція з вагами є в усіх тарифах, а рекомендують ${P.recommendedScale}. Перед купівлею ваг перевірте, чи є ваша модель у списку сумісних.`,
      },
      {
        q: 'Яка програма для магазину працює без інтернету?',
        a: `Торгсофт-Старт і Торгсофт-Ультра тримають базу на вашому комп'ютері й працюють у межах комп'ютера чи локальної мережі, а їхній ПРРО без зв'язку переходить в офлайн. У Poster «Робота в офлайні» є в усіх тарифах. Posbox — хмарний: «працює всюди, де є інтернет»; якщо фіскалізація тимчасово недоступна, чек зберігається в історії, і його відправляють на фіскалізацію пізніше. Для будь-якого ПРРО закон обмежує офлайн: режим «може тривати не більше 36 годин», а всього — «не більше 168 годин протягом календарного місяця» (Закон № 265/95-ВР, ст. 5).`,
      },
      {
        q: 'Чи треба окремо платити за ПРРО?',
        a: `Залежить від програми. У Торгсофт програмний РРО — опція за ${uah(T.prroYearUah)} грн на рік за кожну касу, а сторонніх ПРРО Торгсофт не підтримує. У Poster ПРРО — ще ${P.prroUah} ₴/міс за касу. У Posbox ПРРО Checkbox уже входить у ціну тарифу. У ${POS} фіскалізація — через Checkbox, і підписку Checkbox магазин оплачує окремо: ${CB.priceFrom} грн/міс за касу.`,
      },
      {
        q: 'Торгсофт чи Poster: що обрати для продуктового магазину?',
        a: `Торгсофт — програма для Windows, яку купують один раз на робоче місце або орендують на рік, з повним обліком і продажем у борг у версіях ${DEBT_LICENCES}; ваги й ПРРО — річні опції на кожен пристрій. Poster — хмарна каса на iOS, Android чи Windows з оплатою щомісяця, роботою офлайн і вагами в усіх тарифах; тариф обирають за кількістю товарів (${P_ITEMS}). Продажу в борг на сторінках Poster ми не знайшли: якщо даєте товар під запис, спитайте в них прямо.`,
      },
      {
        q: 'Чи є продаж під запис і ваговий товар у The Live Shop POS?',
        a: `Так. Продаж під запис — з 24 жовтня 2026 року: борг записується на покупця при видачі товару, з лімітом від власника, а фіскальний чек каса пробиває при оплаті. Ваговий товар — з 25 жовтня: ціна за кілограм, вага в чеку до грама, набрана з дисплея ваг на клавіатурі каси, з позначкою «вагу введено вручну», цінник за 1 кг і за 100 г. Каса продає й фасований товар зі штрихкодом, веде склад документами, пробиває фіскальні чеки через Checkbox онлайн і офлайн, а десктопна каса продає без інтернету — і під запис без інтернету теж записує. Ваги з друком етикеток, ваги на касі й каса на телефоні для ринку — у планах; готовність кожної частини — на сторінці каси для продуктового магазину.`,
      },
    ],
  },
  Body,
};

function Body() {
  const today = (GROCERY?.featureIds ?? []).filter(isAvailable).map((id) => FEATURES[id].label);
  const coming = roadmapFor('grocery');
  return (
    <>
      <p className="lead">
        Продуктовому магазину від програми потрібні п'ять речей: фіскальний чек ПРРО, склад зі
        сканером, ваговий товар, продаж у борг постійним покупцям і робота, коли зникли світло чи
        інтернет. Ми прочитали сторінки трьох програм, які в Україні пропонують магазинам, — Торгсофт,
        Posbox від Checkbox і Poster — і зібрали, що з цього вміє кожна і скільки коштує каса на одну
        точку. Коротко: ваги підключаються до всіх трьох, а продаж у борг прямо описує лише Торгсофт,
        і лише у версіях {DEBT_LICENCES}. Сторінки прочитано {CHECKED}.
      </p>
      <div className="callout">
        Нашої каси в таблицях немає: це порівняння трьох програм за їхніми ж сторінками. Що з цього вміє{' '}
        {POS}, а що в нас іще в розробці, — наприкінці статті.
      </div>

      <h2>Коротко: кому що підходить</h2>
      <ul>
        <li>
          <strong>Торгсофт</strong> — якщо вам потрібен повний облік на комп'ютері з Windows і продаж у
          борг із лімітом на покупця, а ліцензію ви готові купити одним платежем; ваги й ПРРО
          докуповуються річними опціями на кожен пристрій.
        </li>
        <li>
          <strong>Posbox</strong> — якщо вам потрібна проста хмарна каса на Android-планшеті чи в
          браузері, у ціну якої вже входить ПРРО Checkbox, з вагами й ваговим штрихкодом; склад — з
          тарифу {PB_BUSINESS.id} за {PB_BUSINESS.monthlyUah} ₴/міс.
        </li>
        <li>
          <strong>Poster</strong> — якщо вам потрібна хмарна каса на iOS, Android чи Windows, що працює
          офлайн у всіх тарифах, з вагами й цінниками; тариф обираєте за кількістю товарів, а ПРРО —
          ще {P.prroUah} ₴/міс за касу.
        </li>
      </ul>
      <p>
        Торгсофт і Poster мають окремі сторінки й тарифи для магазинів, а Posbox — система від Checkbox,
        що вийшла 2025 року, для малої й середньої роздрібної торгівлі. Якщо ви даєте товар під запис, головне
        питання — де записується борг: опис продажу в борг ми знайшли лише в Торгсофт.
      </p>

      <h2>Порівняння за можливостями</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Що порівнюємо</th>
              <th>Торгсофт</th>
              <th>Posbox</th>
              <th>Poster</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Де працює</td>
              <td>
                Комп'ютер з Windows; база — на вашому комп'ютері чи сервері. Мобільний додаток — опція{' '}
                {uah(T.mobileAppUah)} грн на пристрій, працює з базою через сервер
              </td>
              <td>Android-планшет або браузер; дані — у хмарі</td>
              <td>iOS, Android, Windows; хмара</td>
            </tr>
            <tr>
              <td>Як платите</td>
              <td>Ліцензія на робоче місце: один раз або оренда на рік; частина опцій — щороку</td>
              <td>Підписка щомісяця</td>
              <td>Підписка щомісяця, дешевша при оплаті за рік</td>
            </tr>
            <tr>
              <td>Продаж у борг</td>
              <td>
                У версіях {DEBT_LICENCES} — для покупців зі статусом «VIP-клієнт»: ліміт боргу, «Картка
                взаєморозрахунків» як акт звірки, нагадування опцією за {uah(T.mailingsYearUah)} грн/рік.
                У Старт «режим продажу в борг відсутній»
              </td>
              <td>На сайті й у базі знань не згадано</td>
              <td>На сторінках тарифів і «Poster для магазину» не згадано</td>
            </tr>
            <tr>
              <td>Ваги на касі</td>
              <td>
                Опція {uah(T.tillScalesYearUah)} грн/рік на кожен пристрій; {T_SCALES}
              </td>
              <td>{PB.scaleBrands.join(', ')} — через їхню програму POSPort</td>
              <td>У всіх тарифах; рекомендують {P.recommendedScale}</td>
            </tr>
            <tr>
              <td>Ваги з друком етикеток</td>
              <td>
                Опція «Фасування та маркування вагового товару» — {uah(T.labelScalesYearUah)} грн/рік на
                пристрій
              </td>
              <td>
                Ваговий штрихкод наліпки з префіксами {PB.weightBarcodePrefixes.join(', ')}: кількість
                береться зі штрихкоду
              </td>
              <td>На сторінках не згадано</td>
            </tr>
            <tr>
              <td>Цінники</td>
              <td>Друк етикеток з інформацією про товар, власні штрихкоди</td>
              <td>Друк цінників: назва, ціна, штрихкод</td>
              <td>Безкоштовно, у PDF: назва, ціна, штрихкод, вага</td>
            </tr>
            <tr>
              <td>Без інтернету</td>
              <td>
                Локальна база працює в межах комп'ютера чи локальної мережі, ПРРО переходить в офлайн.
                Для віддаленого сервера — опція «Гібрид», {uah(T.hybridUah)} грн за підключення
              </td>
              <td>
                «Усе в хмарі: працює всюди, де є інтернет»; якщо фіскалізація тимчасово недоступна, чек
                зберігається, і його відправляють пізніше з історії чеків
              </td>
              <td>Робота в офлайні — у всіх тарифах</td>
            </tr>
            <tr>
              <td>ПРРО</td>
              <td>
                Власний, опція {uah(T.prroYearUah)} грн/рік на кожну касу; сторонніх ПРРО не підтримує
              </td>
              <td>Checkbox, у ціні тарифу</td>
              <td>Власний, {P.prroUah} ₴/міс за касу</td>
            </tr>
            <tr>
              <td>Склад</td>
              <td>Прихід, повернення, залишки й інвентаризація — у базовій версії</td>
              <td>Складський облік, інвентаризація, списання — з {PB_BUSINESS.id}</td>
              <td>
                Залишки, постачання, списання — у всіх тарифах; інвентаризації — з {P_STOCKTAKE_FROM}
              </td>
            </tr>
            <tr>
              <td>Скільки товарів</td>
              <td>У таблиці ліцензій ліміту не вказано</td>
              <td>
                {PB.goodsIncluded} у ціні, кожна наступна тисяча — ще {PB.goodsStepUah} ₴/міс; у{' '}
                {PB_START.id} — до {PB.startGoodsLimit}
              </td>
              <td>{P_ITEMS} — за тарифом</td>
            </tr>
            <tr>
              <td>Спробувати</td>
              <td>Демоверсія на {T.demoDays} днів</td>
              <td>Перший місяць безкоштовно</td>
              <td>{P.trialDays} днів безкоштовно</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        «Не згадано» означає лише те, що ми не знайшли цього на сторінках, перелічених у джерелах
        нижче. Це не доказ, що функції немає: якщо вона вам потрібна, спитайте у виробника.
      </p>

      <h2>Повна ціна: магазин на одну касу</h2>
      <p>
        Приклад — магазин біля дому на одну касу: до {uah(ITEMS)} товарів, ваги на касі й фіскальний чек
        ПРРО. Ціни — зі сторінок виробників, без обладнання, налаштування й SMS.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Програма</th>
              <th>З чого складається</th>
              <th>На рік</th>
              <th>За три роки</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Торгсофт-Старт</td>
              <td>
                Ліцензія {uah(START.perpetualUah)} грн один раз + ПРРО {uah(T.prroYearUah)} грн/рік + ваги
                на касі {uah(T.tillScalesYearUah)} грн/рік; без продажу в борг
              </td>
              <td>
                Перший — {uah(tFirst(START))} грн, далі — {uah(T_YEAR)} грн
              </td>
              <td>{uah(tThree(START))} грн</td>
            </tr>
            <tr>
              <td>Торгсофт-Ультра</td>
              <td>Те саме з ліцензією {uah(ULTRA.perpetualUah)} грн — з продажем у борг</td>
              <td>
                Перший — {uah(tFirst(ULTRA))} грн, далі — {uah(T_YEAR)} грн
              </td>
              <td>{uah(tThree(ULTRA))} грн</td>
            </tr>
            <tr>
              <td>Posbox {PB_BUSINESS.id}</td>
              <td>
                {PB_BUSINESS.monthlyUah} ₴/міс + {pbGoods(ITEMS)} ₴/міс за товари понад {PB.goodsIncluded};
                ПРРО Checkbox — у ціні, окремої плати за ваги на сторінці тарифів немає
              </td>
              <td>{uah(12 * PB_MONTH)} грн</td>
              <td>{uah(36 * PB_MONTH)} грн</td>
            </tr>
            <tr>
              <td>Poster {P_PLAN.id}</td>
              <td>
                {uah(P_PLAN.monthlyUah)} ₴/міс ({uah(P_PLAN.annualUah)} при оплаті за рік) + ПРРО{' '}
                {P.prroUah} ₴/міс; ваги — у тарифі
              </td>
              <td>
                {uah(12 * P_MONTH)} грн, при оплаті за рік — {uah(12 * P_ANNUAL)} грн
              </td>
              <td>
                {uah(36 * P_MONTH)} грн, при оплаті за рік — {uah(36 * P_ANNUAL)} грн
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Чого приклад не враховує. Якщо товарів більше, у Poster до {uah(P_NEXT.items)} — тариф{' '}
        {P_NEXT.id}, {uah(P_NEXT.monthlyUah)} ₴/міс ({uah(P_NEXT.annualUah)} при оплаті за рік), у Posbox
        кожна наступна тисяча — ще {PB.goodsStepUah} ₴/міс, а в Торгсофт ліміту в таблиці ліцензій не
        вказано. Ваги з друком етикеток у Торгсофт — ще {uah(T.labelScalesYearUah)} грн на рік за
        пристрій, нагадування боржникам — {uah(T.mailingsYearUah)} грн на рік. Торгсофт можна й
        орендувати: Старт — {uah(START.yearUah)} грн, Ультра — {uah(ULTRA.yearUah)} грн за рік; разом із
        ПРРО й вагами на касі це {uah(tRent(START))} і {uah(tRent(ULTRA))} грн на рік.
      </p>
      <div className="callout">
        Ціна — не все. Торгсофт за ці гроші дає повний облік на вашому комп'ютері й продаж у борг, Poster
        — хмару на будь-якому пристрої й офлайн у всіх тарифах, Posbox — ПРРО в ціні тарифу. Порівнюйте
        ціну разом зі списком того, що вам справді потрібно.
      </div>

      <h2>Продаж у борг: що вміє кожна</h2>
      <p>
        <strong>Торгсофт</strong> продає в борг лише покупцям зі статусом «VIP-клієнт», і лише у версіях{' '}
        {DEBT_LICENCES}: у Торгсофт-Старт, за їхньою ж сторінкою, «режим продажу в борг відсутній». Як це
        влаштовано, за статтями Торгсофт:
      </p>
      <ul>
        <li>
          три режими обліку — загальна сума боргу, борг за кожною накладною або за кожним товаром у
          накладній; останній рекомендований і стоїть за замовчуванням;
        </li>
        <li>
          максимальна сума боргу на покупця: якщо борг разом із новою покупкою її перевищує, програма
          не дасть продати в борг, поки покупець не погасить різницю;
        </li>
        <li>при скануванні картки покупця каса одразу показує борг; погашати можна повністю чи частинами;</li>
        <li>«Картка взаєморозрахунків» показує борг крок за кроком, її друкують як акт звірки;</li>
        <li>
          нагадування SMS, Viber чи e-mail за розкладом — опція «Масові розсилки клієнтам»,{' '}
          {uah(T.mailingsYearUah)} грн на рік, а повідомлення оплачуються SMS-сервісу за його тарифами;
        </li>
        <li>безнадійний борг закривають функцією «Анулювати борг».</li>
      </ul>
      <p>
        Окремо Торгсофт попереджає про фіскальний чек: продаж у борг разом із програмним РРО на звичайній
        формі «Реалізація» «наразі не підтримується повною мірою», тож для боргу з чеками ПРРО радять
        режим «Торгівля з випискою рахунка».
      </p>
      <p>
        <strong>Posbox</strong> і <strong>Poster</strong>: на сторінках, які ми прочитали, продажу в борг
        не згадано; у Posbox ми переглянули й усю їхню базу знань. Якщо ви даєте товар під запис, спитайте
        в них прямо, де записується борг і коли каса пробиває фіскальний чек.
      </p>
      <p>
        Чи законно продавати в борг, як записувати борг, щоб його можна було довести, і коли пробивати
        чек — у статті{' '}
        <a href="/dovidka/prodazh-pid-zapys-oblik-borgiv">
          «Продаж під запис: як вести облік боргів покупців у магазині»
        </a>
        .
      </p>

      <h2>Ваги й ваговий товар</h2>
      <p>Ваги до каси підключаються в усіх трьох, але по-різному:</p>
      <ul>
        <li>
          <strong>Торгсофт</strong> — дві окремі річні опції, кожна на свій пристрій. «Інтеграція з вагами
          на касі» ({uah(T.tillScalesYearUah)} грн на рік) передає вагу в продаж і сама віднімає тару, а
          «Фасування та маркування вагового товару» ({uah(T.labelScalesYearUah)} грн на рік) працює з
          вагами, що друкують етикетку зі штрихкодом. Магазин, де є і те, і те, платить{' '}
          {uah(T.tillScalesYearUah + T.labelScalesYearUah)} грн на рік.
        </li>
        <li>
          <strong>Posbox</strong> — ваги {PB.scaleBrands.join(', ')} за протоколом Mettler Toledo через їхню
          програму POSPort; ваговий товар продається за штрихкодом, у якому вже закодовано кількість, з
          префіксами {PB.weightBarcodePrefixes.join(', ')}.
        </li>
        <li>
          <strong>Poster</strong> — «Інтеграція з вагами» відмічена в усіх тарифах: ваги передають вагу
          на касу під час продажу; рекомендують {P.recommendedScale}. Читання вагового штрихкоду з
          наліпки на сторінках не згадано.
        </li>
      </ul>
      <p>
        Як має виглядати вага в чеку і що писати на цінику вагового товару — у статті{' '}
        <a href="/dovidka/vagovyi-tovar-cherez-prro">
          «Ваговий товар через ПРРО: як указати вагу в чеку і що писати на цінику»
        </a>
        .
      </p>

      <h2>Шість питань перед вибором</h2>
      <ol>
        <li>
          <strong>Чи даєте ви товар під запис?</strong> Якщо так, спитайте, де живе борг: на покупцеві з
          лімітом і випискою чи в зошиті поруч із касою. І коли каса пробиває фіскальний чек — при видачі
          товару чи при оплаті.
        </li>
        <li>
          <strong>Які у вас ваги?</strong> Ваги на касі й ваги з друком етикеток — різні пристрої, і в
          кожної програми свій список сумісних. Перевірте свою модель до купівлі.
        </li>
        <li>
          <strong>Скільки у вас товарів?</strong> У Poster тариф залежить від кількості товарів ({P_ITEMS}),
          у Posbox понад {PB.goodsIncluded} товарів платять за кожну тисячу. Порахуйте позиції разом із
          ваговими.
        </li>
        <li>
          <strong>Що буде без світла й інтернету?</strong> Спитайте, чи продає каса без мережі і що
          станеться з чеками. Офлайн-чеки ПРРО закон обмежує для всіх: режим офлайн «може тривати не більше 36 годин», а
          фіскальні номери для нього можна використовувати «не більше 168 годин протягом календарного
          місяця» (<a href={SOURCES.rroLaw} rel="nofollow noopener">Закон № 265/95-ВР</a>, ст. 5).
        </li>
        <li>
          <strong>Скільки це коштує за три роки?</strong> Разова ліцензія з річними опціями й підписка
          щомісяця порівнюються лише на однаковому строку: додайте ПРРО, ваги й кожну додаткову касу.
        </li>
        <li>
          <strong>Продаєте алкоголь чи тютюн?</strong> Перевірте, як програма вносить у чек акцизну марку.
          У базі знань Posbox описано поле акцизної марки, яке каса показує під час продажу алкоголю; на
          головній Торгсофт пише, що підтримує «облік за УКТЗЕД, ПДВ, акцизів».
        </li>
      </ol>
      <p>
        І найпростіша перевірка: на демо кожної програми пробийте свій звичайний чек — пачку кави
        сканером, сир із ваг і хліб у борг сусідці — і подивіться, скільки це займає часу.
      </p>

      <h2>А де тут {POS}</h2>
      <p>
        Каса для продуктового магазину в нас <strong>працює</strong>: продаж під запис — з 24 жовтня 2026
        року, ваговий товар із ціною за кілограм — з 25 жовтня. Ось що вона вміє вже сьогодні:
      </p>
      <ul>
        {today.map((label) => (
          <li key={label}>{label}</li>
        ))}
      </ul>
      <p>А це в розробці — з готовністю, яку ми оновлюємо, коли робота рухається:</p>
      <ul>
        {coming.map((item) => (
          <li key={item.id}>
            {item.title} — {item.progress} %
          </li>
        ))}
      </ul>
      <p>
        Ціна самої каси: {PRICING.pos.label.toLowerCase()}; підписку Checkbox магазин оплачує окремо —{' '}
        {CB.priceFrom} грн/міс за касу. Для підакцизних товарів каса поки не підходить. Якщо ви торгуєте на
        ринку, спершу перевірте, чи потрібен вам ПРРО взагалі, — у статті{' '}
        <a href="/dovidka/chy-potriben-prro-na-rynku">«Чи потрібен ПРРО для торгівлі на ринку»</a>. Усе
        про нашу касу для продуктів — на сторінці <a href={LANDING}>каси для продуктового магазину</a>.
      </p>

      <h2>Джерела</h2>
      <p>
        Прочитано {CHECKED}. Торгсофт:{' '}
        <a href={T.sources.home} rel="nofollow noopener">головна</a> (можливості програми),{' '}
        <a href={T.sources.grocery} rel="nofollow noopener">програма для магазину продуктів</a>,{' '}
        <a href={T.sources.licenses} rel="nofollow noopener">ціни ліцензій</a>,{' '}
        <a href={T.sources.options} rel="nofollow noopener">додаткові опції</a>, сторінки опцій{' '}
        <a href={T.sources.scales} rel="nofollow noopener">«Інтеграція з вагами на касі»</a>,{' '}
        <a href={T.sources.prro} rel="nofollow noopener">«Програмний РРО»</a> і{' '}
        <a href={T.sources.app} rel="nofollow noopener">«Мобільний додаток Торгсофт»</a>, статті{' '}
        <a href={T.sources.debts} rel="nofollow noopener">«Облік боргів покупців»</a>,{' '}
        <a href={T.sources.debtors} rel="nofollow noopener">«Робота з боржниками»</a> і{' '}
        <a href={T.sources.debtFiscalization} rel="nofollow noopener">«VIP-клієнт у борг і ПРРО»</a>.
        Posbox: <a href={PB.sources.site} rel="nofollow noopener">головна</a>,{' '}
        <a href={PB.sources.prices} rel="nofollow noopener">тарифи</a> (ціни й калькулятор),{' '}
        <a href={PB.sources.grocery} rel="nofollow noopener">сторінка для магазинів продуктів</a>, статті
        бази знань <a href={PB.sources.weighed} rel="nofollow noopener">«Додавання вагового товару»</a>,{' '}
        <a href={PB.sources.scales} rel="nofollow noopener">«Які ваги можна підключити»</a>,{' '}
        <a href={PB.sources.fiscalDown} rel="nofollow noopener">
          «Як діяти, якщо фіскалізація тимчасово недоступна»
        </a>{' '}
        і <a href={PB.sources.excise} rel="nofollow noopener">«Продаж акцизного товару»</a>, а також{' '}
        <a href={PB.sources.blog} rel="nofollow noopener">публікація Checkbox про Posbox</a>. Poster:{' '}
        <a href={P.sources.pricing} rel="nofollow noopener">тарифи для магазинів</a> і{' '}
        <a href={P.sources.shop} rel="nofollow noopener">«Poster для магазину»</a>. Ціна Checkbox — з{' '}
        <a href={CB.source} rel="nofollow noopener">їхньої публікації про нові тарифи</a>; межі
        офлайн-режиму — <a href={SOURCES.rroLaw} rel="nofollow noopener">Закон № 265/95-ВР</a> (ред. від
        26.06.2026), ст. 5. Торгсофт, Posbox, Checkbox і Poster — торгові марки їхніх власників; ми з ними
        не пов'язані. Бачите неточність — напишіть нам через сторінку <a href="/about">«Про сервіс»</a>,
        ми виправимо й оновимо дату.
      </p>
    </>
  );
}
