import type { Article } from './types';
import { COMPETITOR_FACTS, PRICING, PRODUCT } from '../../lib/productFacts';
import { formatDateUk, latestDay } from '../../lib/formatDate';

const POS = PRODUCT.pos.name;
const CB = COMPETITOR_FACTS.checkbox;
const CBP = CB.pricing;
const CA = COMPETITOR_FACTS.cashalot;
/** Both provider pages were read on the same day; every figure below comes from COMPETITOR_FACTS. */
const CHECKED = formatDateUk(latestDay(CBP.checkedAt, CA.checkedAt));
/** «4 176»: grouped by hand, because a locale's separator differs between Node and a browser and would break hydration. */
const uah = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const CHECKBOX_PLAN = PRICING.pos.plans.find((p) => p.id === 'external-prro')!;
const CASHALOT_PLAN = PRICING.pos.plans.find((p) => p.id === 'cashalot-prro')!;
/** A year of one register: Checkbox shows a monthly price only, Cashalot an annual licence. */
const CB_YEAR = 12 * CBP.priceMonthly;
const CA_YEAR = CA.priceYear;

const GUIDE = '/dovidka/vlasnyk-pochatok#krok-9-fiskalizatsiia-prro';

export const checkboxChyCashalotPrroDlyaKasy: Article = {
  meta: {
    slug: 'checkbox-chy-cashalot-prro-dlya-kasy',
    kind: 'article',
    eyebrow: 'ПРРО і фіскалізація',
    title: 'Checkbox чи Cashalot: який ПРРО підключити до каси магазину',
    description: `Checkbox чи Cashalot для каси магазину, кав'ярні чи квіткової: скільки коштує кожен ПРРО на одну касу, що з кожним працює в ${POS} — зміни, Z-звіт, фіскальний чек, повернення, робота без інтернету — і як підключити Cashalot. Ціни станом на ${CHECKED}.`,
    publishedAt: '2026-11-03',
    updatedAt: latestDay(CBP.checkedAt, CA.checkedAt, PRICING.pos.changedAt),
    ogImage: '/og/pos.png',
    readingMinutes: 6,
    cta: {
      heading: 'Підключити касу з Checkbox чи Cashalot?',
      subheading: `${POS} працює з обома провайдерами ПРРО. Залиште телефон — покажемо касу на демо й підключимо той ПРРО, який вам зручніший.`,
      button: 'Замовити демо',
      intent: 'demo',
    },
    faq: [
      {
        q: 'Який ПРРО обрати для магазину: Checkbox чи Cashalot?',
        a: `Якщо касі треба продавати без інтернету — Checkbox: з ним ${POS} пробиває чеки з резерву офлайн-кодів і відправляє їх у ДПС, щойно зв'язок повернеться. Якщо інтернет стабільний і важлива ціна — Cashalot: за умови річної оплати його ліцензія коштує ${CA.priceMonthlyAnnual} грн/міс за касу проти ${CBP.priceMonthly} грн/міс у Checkbox (ціни станом на ${CHECKED}). Зміни, Z-звіт, фіскальний чек із QR, повернення й службові чеки каса робить з обома.`,
      },
      {
        q: 'Скільки коштує Checkbox і Cashalot для однієї каси?',
        a: `Checkbox — ${CBP.priceMonthly} грн/міс за касу (з ПДВ), перші ${CBP.freeDays} днів безкоштовно; річної ціни на сторінці тарифів немає, тож за рік — ${uah(CB_YEAR)} грн. Cashalot — ${CA.priceMonthlyAnnual} грн/міс за касу за умови оплати річної ліцензії, тобто ${uah(CA_YEAR)} грн на рік, перший місяць безкоштовно для нових клієнтів. Сама каса ${POS} коштує однаково з будь-яким провайдером: ${PRICING.pos.launch.label.toLowerCase()}, далі ${CHECKBOX_PLAN.price} грн/міс за магазин до ${PRICING.pos.perStoreRegisters} кас. Ціни станом на ${CHECKED}.`,
      },
      {
        q: 'Чи працює каса з Cashalot без інтернету?',
        a: `Ні: з Cashalot ${POS} пробиває чеки, поки є інтернет. Коли недоступний сервер ДПС, а Cashalot — доступний, Cashalot сам реєструє чеки у своїй офлайн-сесії й передає їх у ДПС пізніше; на чеку тоді стоїть «ОФЛАЙН», а QR-код друкується одразу. Продавати зовсім без інтернету каса вміє лише з Checkbox.`,
      },
      {
        q: 'Що потрібно з кабінету Cashalot, щоб підключити касу?',
        a: `Три значення: ідентифікатор ключа (KeyGuid) і PIN касира — у кабінеті Cashalot, розділ «Налаштування → Інтеграція з WEB API → Управління касирами», — і фіскальний номер ПРРО зі сторінки каси. На касу в кабінеті має бути завантажена ліцензія. Ключ КЕП лишається в Cashalot, нам його передавати не треба.`,
      },
      {
        q: 'Чи можна спершу перевірити Cashalot без фіскальних чеків?',
        a: `Так. На екрані «Фіскалізація» в ${POS} є перемикач «Тестовий режим»: зміна й чеки йдуть на ваш справжній ПРРО з позначкою тестових, без фіскальної сили. Перевірте продаж, повернення й закриття зміни, потім закрийте зміну й вимкніть тестовий режим — далі чеки фіскальні.`,
      },
      {
        q: 'Чи можна перейти з Checkbox на Cashalot або навпаки?',
        a: `Касу — так: провайдер обирається в налаштуваннях фіскалізації, і збережені ключі попереднього провайдера при цьому видаляються. Перед цим закрийте зміну. Сам програмний РРО реєструється в ДПС через того провайдера, з яким ви працюєте, — тож перехід у Cashalot означає зареєструвати в ньому ПРРО; що з цього потрібно саме вам, уточніть у провайдера й бухгалтера.`,
      },
      {
        q: 'Чи підтримує каса Вчасно.Каса чи Є-Чек?',
        a: `Поки ні: зараз ${POS} працює з Checkbox і Cashalot. Вчасно.Каса та Є-Чек — у наших планах.`,
      },
    ],
  },
  Body,
};

function Body() {
  return (
    <>
      <p className="lead">
        {POS} фіскалізує чеки через два програмні РРО на вибір — Checkbox і Cashalot. З обома каса
        відкриває й закриває зміни, формує X- і Z-звіт, друкує фіскальний чек із QR-кодом, видатковий
        чек на повернення і службові чеки. Різниця в двох речах: Checkbox дає касі продавати без
        інтернету, а Cashalot дешевший, якщо платити за рік. Ціни провайдерів — станом на {CHECKED}.
      </p>

      <h2>Скільки коштує кожен ПРРО на одну касу</h2>
      <table>
        <thead>
          <tr>
            <th />
            <th>Checkbox</th>
            <th>Cashalot</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Ціна за касу</td>
            <td>{CBP.priceMonthly} грн/міс (з ПДВ), помісячно</td>
            <td>
              {CA.priceMonthlyAnnual} грн/міс за умови оплати річної ліцензії ({uah(CA_YEAR)} грн)
            </td>
          </tr>
          <tr>
            <td>За рік</td>
            <td>{uah(CB_YEAR)} грн</td>
            <td>{uah(CA_YEAR)} грн</td>
          </tr>
          <tr>
            <td>Безкоштовно</td>
            <td>Перші {CBP.freeDays} днів</td>
            <td>Перший місяць, для нових клієнтів</td>
          </tr>
          <tr>
            <td>Наша каса</td>
            <td>
              {CHECKBOX_PLAN.price} грн/міс за магазин
            </td>
            <td>
              {CASHALOT_PLAN.price} грн/міс за магазин
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        Підписку провайдера магазин оплачує окремо від каси, і вона рахується за кожну касу, а наша
        ціна — за магазин до {PRICING.pos.perStoreRegisters} кас. Зараз {POS}{' '}
        {PRICING.pos.launch.label.toLowerCase()}. Checkbox з {formatDateUk(CB.priceFromDate)} коштує{' '}
        {CB.priceFrom} грн/міс замість {CB.priceNow}; на сторінці тарифів Cashalot, яку ми прочитали,
        помісячної ціни без річної оплати не вказано.
      </p>

      <h2>Що працює в нашій касі з кожним провайдером</h2>
      <table>
        <thead>
          <tr>
            <th />
            <th>Checkbox</th>
            <th>Cashalot</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Зміни, X- і Z-звіт</td>
            <td>Так</td>
            <td>Так</td>
          </tr>
          <tr>
            <td>Фіскальний чек із QR на чековому принтері</td>
            <td>Так</td>
            <td>Так</td>
          </tr>
          <tr>
            <td>Повернення видатковим чеком, обмін двома чеками</td>
            <td>Так</td>
            <td>Так</td>
          </tr>
          <tr>
            <td>Службове внесення й видача готівки</td>
            <td>Так</td>
            <td>Так</td>
          </tr>
          <tr>
            <td>Продаж без інтернету</td>
            <td>Так: з резерву офлайн-кодів ДПС, чеки йдуть у ДПС, щойно повернеться зв'язок</td>
            <td>Ні: каса продає, поки є інтернет</td>
          </tr>
          <tr>
            <td>Коли недоступна ДПС</td>
            <td>Каса переходить на офлайн-коди</td>
            <td>Cashalot сам реєструє чеки у своїй офлайн-сесії; на чеку «ОФЛАЙН», QR одразу</td>
          </tr>
          <tr>
            <td>Чек передплати за борг (модуль «Борги»)</td>
            <td>Так</td>
            <td>Ні: борг закривається цілими товарами й штуками</td>
          </tr>
          <tr>
            <td>Друк чека в тексті провайдера</td>
            <td>Можна обрати</td>
            <td>Ні: каса друкує свій макет із фіскальним блоком</td>
          </tr>
          <tr>
            <td>Таблиця ставок податку</td>
            <td>Приходить із кабінету Checkbox</td>
            <td>Вносите на екрані «Фіскалізація», як у кабінеті Cashalot</td>
          </tr>
          <tr>
            <td>Тестовий режим у касі</td>
            <td>Немає перемикача</td>
            <td>Так: тестові чеки на справжній ПРРО, без фіскальної сили</td>
          </tr>
        </tbody>
      </table>

      <h2>Де кожен сильніший</h2>
      <ul>
        <li>
          <strong>Checkbox</strong> — якщо магазину треба продавати, коли зник інтернет, якщо ви
          берете гроші за борг частинами з чеком передплати або хочете друкувати чек у вигляді
          Checkbox. Платите помісячно, без річного платежу.
        </li>
        <li>
          <strong>Cashalot</strong> — якщо інтернет у точці стабільний і ви готові заплатити за рік:
          ліцензія виходить {uah(CA_YEAR)} грн на касу проти {uah(CB_YEAR)} грн у Checkbox. Коли
          збоїть сама ДПС, Cashalot продовжує реєструвати чеки у своїй офлайн-сесії.
        </li>
      </ul>
      <div className="callout">
        Офлайн-сесія Cashalot працює лише для ПРРО, якому при реєстрації в ДПС (форма 1-ПРРО) дозволено
        роботу в офлайн-режимі. Якщо реєструєте ПРРО в Cashalot — поставте цю позначку одразу.
      </div>

      <h2>Як підключити Cashalot до каси</h2>
      <ol>
        <li>
          У кабінеті Cashalot: господарська одиниця, каса (ПРРО) і касир із КЕП; на касу завантажте
          ліцензію.
        </li>
        <li>
          «Налаштування → Інтеграція з WEB API» — увімкніть; у «Управління касирами» з'являться
          ідентифікатор ключа (KeyGuid) і PIN касира. Фіскальний номер ПРРО — на сторінці каси.
        </li>
        <li>
          У {POS}: «Налаштування → Фіскалізація (ПРРО)» → провайдер «Cashalot»; на екрані
          «Фіскалізація» — три значення з кабінету і таблиця ставок податку (ФОП без ПДВ лишає її
          порожньою).
        </li>
        <li>
          Увімкніть «Тестовий режим», натисніть «Перевірити з'єднання», відкрийте зміну й пробийте
          продаж. Усе гаразд — закрийте зміну, вимкніть тестовий режим, і далі чеки фіскальні.
        </li>
      </ol>
      <p>
        Покроково з усіма екранами — у <a href={GUIDE}>посібнику власника, «Крок 9. Фіскалізація»</a>.
        Модуль фіскалізації до вашого магазину підключимо ми — напишіть через форму нижче.
      </p>

      <h2>Джерела</h2>
      <p>
        Прочитано {CHECKED}. Checkbox:{' '}
        <a href={CBP.source} rel="nofollow noopener">
          сторінка цін
        </a>{' '}
        і{' '}
        <a href={CB.source} rel="nofollow noopener">
          публікація про нові тарифи
        </a>{' '}
        ({formatDateUk(CB.checkedAt)}). Cashalot:{' '}
        <a href={CA.source} rel="nofollow noopener">
          сторінка тарифів
        </a>
        . Що працює в {POS} з кожним провайдером — за нашою касою; з Cashalot її перевірено на
        справжньому ПРРО в тестовому режимі. Checkbox і Cashalot — торгові марки їхніх власників; ми з
        ними не пов'язані. Бачите неточність — напишіть нам через сторінку{' '}
        <a href="/about">«Про сервіс»</a>, ми виправимо й оновимо дату.
      </p>
    </>
  );
}
