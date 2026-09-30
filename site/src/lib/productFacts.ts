// Single source of truth for everything the site claims about the product:
// names, prices and per-feature status. Page copy, FAQ answers, JSON-LD and the
// generated llms.txt all read from here, so a feature flips from «у розробці»
// to «є» in one line.

export const SITE_URL = 'https://the-live.shop';
export const RELEASES_URL = 'https://github.com/merenkoff/tiktok-live/releases/latest';

export const ORG = {
  name: 'ТОВ «Технології»',
  legalName: 'Товариство з обмеженою відповідальністю «Технології»',
  alternateName: ['The Live Shop', 'LiveShop'],
  taxId: '46288273',
  url: SITE_URL,
  sameAs: ['https://github.com/merenkoff/tiktok-live'],
} as const;

export const PRODUCT = {
  pos: {
    name: 'The Live Shop POS',
    alternateName: 'LiveShop POS',
    url: `${SITE_URL}/pos`,
    operatingSystem: 'Windows, macOS, Linux',
    description:
      'Каса для магазину одягу, квіткової крамниці, кав\'ярні й ресторану — товари, штрихкоди, склад, знижки, QR-оплата, фіскалізація ПРРО через Checkbox і десктопний термінал з офлайн-режимом.',
  },
  live: {
    name: 'The Live Shop — TikTok LIVE',
    alternateName: 'LiveShop LIVE',
    url: `${SITE_URL}/live`,
    operatingSystem: 'Web',
    description:
      'Бот читає коментарі TikTok LIVE, тримає товар бронею, оформлює замовлення в Telegram і створює ТТН Нової Пошти.',
  },
} as const;

export type PlanStatus = 'available' | 'coming';

export interface PosPlan {
  id: 'external-prro' | 'own-prro';
  name: string;
  /** UAH per month, per store. */
  price: number;
  note: string;
  status: PlanStatus;
  /** How long the price is locked for whoever joins during the launch. */
  lock: string;
}

/**
 * POS pricing, decided 2026-09-23. Free during the launch, then a monthly fee
 * per STORE (up to `perStoreRegisters` registers) that depends on who does the
 * fiscalisation: an external ПРРО provider the store pays separately, or our
 * own ПРРО — which is not built yet (`FEATURES.ownPrro` says so), so its plan
 * is `coming` and its JSON-LD offer is a PreOrder. Tables are an add-on.
 * Whoever joins now keeps the price; nothing is prepaid.
 */
export const PRICING = {
  pos: {
    currency: 'UAH',
    launch: { price: 0, label: 'Безкоштовно на період запуску' },
    perStoreRegisters: 4,
    plans: [
      {
        id: 'external-prro',
        name: 'Каса + Checkbox',
        price: 100,
        note: 'Фіскалізація через Checkbox; підписку Checkbox магазин оплачує окремо.',
        status: 'available',
        lock: 'назавжди для тих, хто підключився на період запуску',
      },
      {
        id: 'own-prro',
        name: 'Каса + власний ПРРО',
        price: 200,
        note: 'Фіскалізація вбудована — без окремої підписки на ПРРО. У розробці.',
        status: 'coming',
        lock: 'на 2 роки для тих, хто підключився на період запуску',
      },
    ] satisfies PosPlan[],
    addons: [{ id: 'tables', name: 'Столи й офіціанти (ресторан)', price: 50 }],
    billing: 'Помісячно, без передплати за рік.',
    label: 'Безкоштовно на період запуску, далі від 100 грн/міс за магазин',
    detail:
      'Зараз каса безкоштовна — на період запуску, без обмежень за кількістю продажів. Далі — 100 грн/міс за магазин (до 4 кас) з фіскалізацією через Checkbox або 200 грн/міс із власним ПРРО, коли він вийде; столи для ресторану — ще 50 грн/міс. Оплата помісячно, без передплати за рік, і ціна закріплюється за тими, хто підключився на період запуску.',
  },
  live: {
    trialMonths: 6,
    price: 500,
    currency: 'UAH',
    label: '6 місяців безкоштовно, далі 500 грн/міс',
    detail:
      'Для перших користувачів: 6 місяців безкоштовно, далі 500 грн на місяць — і ця ціна закріплюється за вами, поки ви з нами. Усі нові функції LIVE-модуля входять у ваш тариф без доплат.',
  },
} as const;

/**
 * The only place a competitor's numbers live, with the date they were read
 * and where. Copy that compares prices must read from here so the claim and
 * its source never drift apart.
 */
export const COMPETITOR_FACTS = {
  checkbox: {
    name: 'Checkbox',
    source: 'https://checkbox.ua/blog/onovlennia-tarifiv-checkbox-ta-iak-zafiksuvati-potochnu-tsinu/',
    checkedAt: '2026-09-23',
    /** UAH per register per month before the change. */
    priceNow: 249,
    /** UAH per register per month from `priceFromDate`. */
    priceFrom: 348,
    priceFromDate: '2026-10-19',
    /** The old price can be kept only by prepaying before this date… */
    lockBy: '2026-10-18',
    /** …for at most this many months… */
    lockMaxMonths: 12,
    /** …and never past this date. */
    lockUntil: '2027-10-19',
  },
  /**
   * Read from kavapp.com on `checkedAt`, page by page — the tariff page's own
   * FAQ («Чим відрізняються тарифні плани?») is what says which plan carries
   * what, because the cards above it list every feature under every plan.
   * «Not mentioned» below means not mentioned on those pages, never «does not
   * exist»; the comparison article words it that way.
   */
  kavapp: {
    name: 'Kavapp',
    checkedAt: '2026-09-29',
    sources: {
      tariffs: 'https://kavapp.com/uk/tariffs',
      prro: 'https://kavapp.com/uk/prro',
      seller: 'https://kavapp.com/uk/seller',
      coffeeShop: 'https://kavapp.com/uk/for-whom/coffee-shop',
    },
    /** USD per outlet per month, exactly as the tariff page prints it. */
    plans: [
      { id: 'S', priceUsd: 3.85, note: 'без розрахунку собівартості позицій' },
      { id: 'M', priceUsd: 6.28, note: 'собівартість, облік закупівель, дисконтна система, конструктор акцій, заготівлі, месенджер' },
      { id: 'L', priceUsd: 9.48, note: 'конструктор позицій меню (параметри й модифікатори напоїв), централізована логістика, різні меню й ціни по точках, QR-меню' },
    ],
    /** The tariff page's own <title>: «від 154 грн/міс». */
    fromUah: 154,
    trialDays: 14,
    /** «ПРРО входить у всі тарифи Kavapp і не потребує додаткової оплати». */
    prroIncluded: true,
  },
  /**
   * monobank Expirenza — read on `checkedAt`, the service's own page first and
   * two press pieces for what the page does not say. Same rule as above:
   * «not mentioned» means not mentioned on those pages, never «does not
   * exist». The page prints NO commission, so none is recorded here: figures
   * in older press differ from each other and are not ours to repeat.
   */
  expirenza: {
    name: 'monobank Expirenza',
    checkedAt: '2026-09-30',
    sources: {
      service: 'https://expz.monobank.ua/',
      /** mind.ua, 25.06.2024: guests do not need the monobank app, they scan a QR. */
      press: 'https://mind.ua/news/20272773-monobank-zapuskae-mobilnij-zastosunok-dlya-klientiv-kafe-bariv-i-restoraniv',
      /** kosht.media, 15.07.2024: the partnership with ChoiceQR. */
      partnership: 'https://kosht.media/choiceqr-ta-expirenza-vid-mono-ob-iednuiutsia-shcho-zminylos-dlia-kliientiv/',
    },
    /** «3 800+ закладів по всій Україні» / «95 міст та містечок» — the service page's own figures. */
    establishments: 3800,
    cities: 95,
    /** What a guest does with the table's QR, as the service page lists it. */
    guestDoes: ['бачить цифрове меню', 'отримує рахунок в один дотик', 'платить', 'залишає чайові', 'залишає відгук', 'бронює стіл'],
    /** The page: «рахунки — з вашої POS-системи» (no cash-register program is named). */
    billFrom: 'з POS-системи закладу',
  },
  /**
   * ChoiceQR — read on `checkedAt`: the Ukrainian page (products and named
   * integrations), the English page for what only it lists (pay at table with
   * bill splitting, delivery and pickup) and the tariff page, whose prices did
   * not render for us — so no price is recorded, and the article says why.
   */
  choiceqr: {
    name: 'ChoiceQR',
    checkedAt: '2026-09-30',
    sources: {
      ua: 'https://choiceqr.com/uk',
      en: 'https://choiceqr.com/',
      tariffs: 'https://choiceqr.com/uk/pricing/',
      /** kosht.media, 15.07.2024: ChoiceQR ↔ Expirenza. */
      partnership: 'https://kosht.media/choiceqr-ta-expirenza-vid-mono-ob-iednuiutsia-shcho-zminylos-dlia-kliientiv/',
    },
    /** «25 000+ закладів вже з Choice» у «25+ країнах світу». */
    establishments: 25000,
    countries: 25,
    trialDays: 14,
    /** Products the Ukrainian page names. */
    products: ['Онлайн-меню', 'Замовлення до столу'],
    /** Cash-register programs the Ukrainian page names as integrations. */
    posIntegrations: ['Poster', 'Syrve', 'Servio', 'Profit', 'R-Keeper'],
  },
} as const;

export type FeatureStatus = 'available' | 'coming';

export interface Feature {
  status: FeatureStatus;
  label: string;
}

export const FEATURES = {
  fiscalOnlineCheckbox: { status: 'available', label: 'Фіскалізація ПРРО через Checkbox: зміни, Z-звіт, фіскальний чек' },
  fiscalReceiptPrint: { status: 'available', label: 'Фіскальний чек із QR-кодом на чековому принтері' },
  fiscalOffline: { status: 'available', label: 'Офлайн-фіскальні чеки з резерву кодів і подальшою відправкою в ДПС' },
  tillHandover: { status: 'available', label: 'Передача каси на інший комп\'ютер без закриття зміни' },
  offlineDesktop: { status: 'available', label: 'Десктопна каса, що продає без інтернету' },
  stocktakeOffline: { status: 'available', label: 'Інвентаризація на касі сканером, навіть офлайн' },
  qrPayment: { status: 'available', label: 'QR-оплата на касі з автоматичним підтвердженням' },
  gtinLookup: { status: 'available', label: 'Розпізнавання товару по штрихкоду через GTIN-довідники' },
  clothingVariants: { status: 'available', label: 'Облік одягу за розміром і кольором на рівні варіантів' },
  floristBench: { status: 'available', label: 'Стіл флориста: «Зібрати букет» зі стебел із підрахунком ціни й роботи' },
  floristShowcase: { status: 'available', label: 'Букет на вітрину з власним цінником і списанням стебел' },
  floristPreorders: { status: 'available', label: 'Передзамовлення букетів з датою видачі, адресою й листівкою' },
  floristAnalytics: { status: 'available', label: 'Аналітика флориста: списання, частка букетів, реалізована націнка' },
  cafeModifiers: { status: 'available', label: 'Модифікатори: розмір, молоко, сироп, соус — ціна рахується сама' },
  cafeTechCards: { status: 'available', label: 'Техкарти з фудкостом, рецепт у рецепті' },
  cafeKitchenBoard: { status: 'available', label: 'Дошка кухні та бару: «Готово» → «Видано», стоп-лист на день' },
  cafeKitchenTicket: { status: 'available', label: 'Кухонний тікет на принтер станції (десктоп-каса)' },
  cafeMenuMatrix: { status: 'available', label: 'Матриця меню, середній чек, замовлення за годинами' },
  qrMenu: { status: 'available', label: 'QR-меню для гостей зі стоп-листом наживо' },
  qrMenuTables: { status: 'available', label: 'QR на кожен стіл із номером столу й лист QR для друку' },
  guestBill: { status: 'available', label: 'Рахунок столу на телефоні гостя: що вже на кухні й сума до сплати' },
  tablesFloorPlan: { status: 'available', label: 'План залу з відкритими рахунками столів' },
  tablesRounds: { status: 'available', label: 'Раунди на кухню: ціна замикається, склад списується при відправці' },
  tablesPrecheck: { status: 'available', label: 'Передчек на принтері (десктоп-каса)' },
  tablesSplitBill: { status: 'available', label: 'Розділити рахунок: за стравами або порівну' },
  ownPrro: { status: 'coming', label: 'Власний ПРРО без стороннього провайдера' },
  tiktokLive: { status: 'available', label: 'TikTok LIVE: коментар → бронь → Telegram → ТТН Нової Пошти' },
  liveAiComments: { status: 'coming', label: 'AI-відповіді в коментарях ефіру' },
  liveStockOverlay: { status: 'coming', label: 'Оверлей залишків для ефіру' },
  liveAnalytics: { status: 'coming', label: 'Аналітика ефірів' },
} as const satisfies Record<string, Feature>;

export type FeatureId = keyof typeof FEATURES;

export const POS_FEATURE_IDS: FeatureId[] = [
  'fiscalOnlineCheckbox',
  'fiscalReceiptPrint',
  'fiscalOffline',
  'tillHandover',
  'offlineDesktop',
  'stocktakeOffline',
  'qrPayment',
  'gtinLookup',
  'clothingVariants',
  'floristBench',
  'floristShowcase',
  'floristPreorders',
  'floristAnalytics',
  'cafeModifiers',
  'cafeTechCards',
  'cafeKitchenBoard',
  'cafeKitchenTicket',
  'cafeMenuMatrix',
  'qrMenu',
  'qrMenuTables',
  'guestBill',
  'tablesFloorPlan',
  'tablesRounds',
  'tablesPrecheck',
  'tablesSplitBill',
  'ownPrro',
];

export const LIVE_FEATURE_IDS: FeatureId[] = ['tiktokLive', 'liveAiComments', 'liveStockOverlay', 'liveAnalytics'];

export function isAvailable(id: FeatureId): boolean {
  return FEATURES[id].status === 'available';
}

export function availableFeatureLabels(ids: FeatureId[]): string[] {
  return ids.filter(isAvailable).map((id) => FEATURES[id].label);
}

export type VerticalId = 'clothing' | 'flowers' | 'cafe' | 'restaurant';

export interface VerticalFact {
  id: VerticalId;
  /** URL slug under /pos/. */
  slug: string;
  path: string;
  /** Short name for menus and cards. */
  title: string;
  /** «Каса для …» — the page's eyebrow and the card's subtitle. */
  eyebrow: string;
  tagline: string;
  bullets: readonly [string, string, string];
  featureIds: FeatureId[];
  /** Flat SVGs from the demo stores, served from /public. */
  illustrations: readonly string[];
  /** Tailwind colour token for the card background. */
  tint: string;
}

/**
 * The four businesses the POS is sold to. A restaurant is the café vertical
 * plus the tables module rather than a fourth vertical in code, but for a
 * buyer it is a different shop, so it gets its own page.
 */
export const VERTICALS: readonly VerticalFact[] = [
  {
    id: 'clothing',
    slug: 'odyah',
    path: '/pos/odyah',
    title: 'Одяг',
    eyebrow: 'Каса для магазину одягу',
    tagline: 'Розміри й кольори, сканер штрихкодів, склад документами — і TikTok LIVE як другий канал.',
    bullets: ['Варіанти за розміром і кольором', 'Штрихкоди й GTIN-довідники', 'Інвентаризація сканером офлайн'],
    featureIds: ['clothingVariants', 'gtinLookup', 'stocktakeOffline', 'tiktokLive'],
    illustrations: ['/demo-clothing/tee-basic.svg', '/demo-clothing/sneakers.svg', '/demo-clothing/dress-midi.svg'],
    tint: 'bg-tint-clothing',
  },
  {
    id: 'flowers',
    slug: 'kvity',
    path: '/pos/kvity',
    title: 'Квіти',
    eyebrow: 'Каса для квіткової крамниці',
    tagline: 'Стіл флориста рахує букет по стеблах, вітрина знає свій цінник, передзамовлення — з датою й адресою.',
    bullets: ['«Зібрати букет» на касі', 'Букет на вітрину з цінником', 'Передзамовлення на дату'],
    featureIds: ['floristBench', 'floristShowcase', 'floristPreorders', 'floristAnalytics'],
    illustrations: ['/demo-flowers/rose-freedom.svg', '/demo-flowers/bouquet-compliment.svg', '/demo-flowers/tulip-pink.svg'],
    tint: 'bg-tint-flowers',
  },
  {
    id: 'cafe',
    slug: 'kafe',
    path: '/pos/kafe',
    title: 'Кафе',
    eyebrow: 'Програма для кав\'ярні за стійкою',
    tagline: 'Тап — і «як завжди»; модифікатори, дошка кухні, стоп-лист, техкарти з фудкостом і матриця меню.',
    bullets: ['Модифікатори з ціною на кнопці', 'Дошка кухні й бару, стоп-лист', 'Техкарти й фудкост'],
    featureIds: ['cafeModifiers', 'cafeKitchenBoard', 'cafeTechCards', 'cafeMenuMatrix', 'cafeKitchenTicket', 'qrMenu'],
    illustrations: ['/demo-cafe/latte.svg', '/demo-cafe/croissant.svg', '/demo-cafe/espresso.svg'],
    tint: 'bg-tint-cafe',
  },
  {
    id: 'restaurant',
    slug: 'restoran',
    path: '/pos/restoran',
    title: 'Ресторан',
    eyebrow: 'Програма для ресторану зі столами',
    tagline: 'План залу, відкриті рахунки, раунди на кухню, передчек і розділення рахунку — з планшета офіціанта.',
    bullets: ['План залу з рахунками столів', 'Раунди на кухню з планшета', 'Розділити рахунок, передчек'],
    featureIds: ['tablesFloorPlan', 'tablesRounds', 'tablesSplitBill', 'tablesPrecheck', 'cafeKitchenBoard', 'qrMenu', 'qrMenuTables', 'guestBill'],
    illustrations: ['/demo-restaurant/borscht.svg', '/demo-restaurant/ribeye.svg', '/demo-restaurant/wine-red.svg'],
    tint: 'bg-tint-restaurant',
  },
];

/**
 * What the site promises next, with a readiness figure. These are commitments
 * to build, not descriptions of code that exists — `TechDocs/SITE_PROMISES.md`
 * is the list to work from, and a figure moves here when the work moves.
 * `vertical: 'pos'` is shared by every store.
 */
export interface RoadmapItem {
  id: string;
  vertical: VerticalId | 'pos';
  title: string;
  body: string;
  /** Readiness in percent, 0–100. */
  progress: number;
}

export const ROADMAP: readonly RoadmapItem[] = [
  {
    id: 'own-prro',
    vertical: 'pos',
    title: 'Власний ПРРО без стороннього провайдера',
    body: 'Фіскальний реєстратор усередині каси: чек іде в ДПС напряму, без окремої підписки й без окремої програми. 200 грн/міс за магазин — і жодних доплат за касу.',
    progress: 35,
  },
  {
    id: 'loyalty',
    vertical: 'pos',
    title: 'Програма лояльності з балами',
    body: 'Бали за покупку і знижка за бали просто на касі — без стороннього CRM. Клієнта впізнає номер телефону, як зараз для знижок.',
    progress: 20,
  },
  {
    id: 'fiscal-providers',
    vertical: 'pos',
    title: 'Вчасно.Каса та Є-Чек як провайдери',
    body: 'Якщо у вас уже є ключ іншого ПРРО — каса підключиться до нього так само, як зараз до Checkbox.',
    progress: 15,
  },
  {
    id: 'shared-catalog',
    vertical: 'clothing',
    title: 'Спільний каталог з TikTok LIVE',
    body: 'Один товар, один залишок — на касі й в ефірі. Продали в залі — бот у коментарях уже знає, що 46-го немає.',
    progress: 40,
  },
  {
    id: 'marketplaces',
    vertical: 'clothing',
    title: 'Маркетплейси: Prom і Rozetka',
    body: 'Залишки й ціни з каси — на маркетплейс, замовлення звідти — у продажі, без ручного перенесення.',
    progress: 15,
  },
  {
    id: 'price-tags',
    vertical: 'clothing',
    title: 'Цінники з QR і власним дизайном',
    body: 'Свій шаблон цінника, QR на сторінку товару чи на оплату — друк тим самим чековим принтером.',
    progress: 10,
  },
  {
    id: 'couriers',
    vertical: 'flowers',
    title: 'Кур\'єрська доставка',
    body: 'Призначити кур\'єра прямо із замовлення, статус «в дорозі» і фото букета при врученні — одержувачу в SMS.',
    progress: 25,
  },
  {
    id: 'deposit',
    vertical: 'flowers',
    title: 'Аванс за передзамовлення',
    body: 'Частина оплати при прийомі — з фіскальним чеком на аванс — і решта при видачі. Букет на 8 березня більше не відміняють у переддень.',
    progress: 30,
  },
  {
    id: 'bench-offline',
    vertical: 'flowers',
    title: 'Стіл флориста без інтернету',
    body: 'Зібрати букет і пробити чек, коли мережа впала, а черга стоїть — картка й документ виробництва доїдуть на сервер потім.',
    progress: 10,
  },
  {
    id: 'holiday-forecast',
    vertical: 'flowers',
    title: 'Календар свят і прогноз закупівлі',
    body: '14 лютого і 8 березня — каса підкаже, скільки троянд купити, за минулорічними продажами й списаннями.',
    progress: 5,
  },
  {
    id: 'aggregators',
    vertical: 'cafe',
    title: 'Доставка через Glovo і Bolt Food',
    body: 'Замовлення з агрегаторів падають на ту саму дошку кухні, зі своїм номером і своїм списанням складу.',
    progress: 15,
  },
  {
    id: 'kds-timers',
    vertical: 'cafe',
    title: 'KDS із таймерами по станціях',
    body: 'Кухонний екран з нормативом на страву: кава — 2 хв, сендвіч — 6, і червоне, коли бар відстає від кухні.',
    progress: 40,
  },
  {
    id: 'tips',
    vertical: 'cafe',
    title: 'Чайові на касі',
    body: 'Кнопка чайових на екрані оплати й QR на чеку — окремо від виручки, з розподілом між зміною.',
    progress: 20,
  },
  {
    id: 'scales',
    vertical: 'cafe',
    title: 'Вагові товари з ваг',
    body: 'Салат-бар і випічка на вагу: підключені ваги, дробова кількість, ціна за 100 г.',
    progress: 10,
  },
  {
    id: 'reservations',
    vertical: 'restaurant',
    title: 'Бронювання столів',
    body: 'Бронь на час із телефону гостя, стіл підсвічується на плані залу за годину до приходу.',
    progress: 15,
  },
  {
    id: 'guest-order',
    vertical: 'restaurant',
    title: 'Замовлення й дозамовлення гостя з телефону',
    body: 'Гість додає страви з QR-меню свого столу, офіціант підтверджує одним тапом — і замовлення йде в рахунок і на кухню. Без підтвердження нічого не потрапляє на кухню й нічого не списується.',
    progress: 10,
  },
  {
    id: 'guest-pay',
    vertical: 'restaurant',
    title: 'Оплата рахунку столу з телефону',
    body: 'Гість платить свій рахунок за QR-кодом столу, а чек фіксується так само, як на касі. Спершу — фіскалізація оплати рахунків столу, потім оплата гостем.',
    progress: 5,
  },
  {
    id: 'courses',
    vertical: 'restaurant',
    title: 'Курси подачі',
    body: '«Гарячі після салатів»: офіціант відправляє рахунок цілком, а кухня отримує другий курс по команді «пробити далі».',
    progress: 30,
  },
  {
    id: 'merge-bills',
    vertical: 'restaurant',
    title: 'Об\'єднання рахунків',
    body: 'Дві компанії зсунули столи — два рахунки стають одним без скасування раундів.',
    progress: 35,
  },
  {
    id: 'restaurant-tips',
    vertical: 'restaurant',
    title: 'Чайові з розподілом між офіціантами',
    body: 'Чайові з картки й QR на передчеку, звіт по кожному офіціанту за зміну.',
    progress: 20,
  },
  {
    id: 'waiter-pwa',
    vertical: 'restaurant',
    title: 'Планшет офіціанта без мережі',
    body: 'Прийняти замовлення на терасі, де не ловить Wi-Fi, і відправити на кухню, щойно зв\'язок повернеться.',
    progress: 10,
  },
];

export function roadmapFor(vertical: VerticalId): RoadmapItem[] {
  return ROADMAP.filter((item) => item.vertical === vertical);
}

export function findVertical(slug: string): VerticalFact | undefined {
  return VERTICALS.find((v) => v.slug === slug);
}
