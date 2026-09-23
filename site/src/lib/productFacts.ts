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
    featureIds: ['cafeModifiers', 'cafeKitchenBoard', 'cafeTechCards', 'cafeMenuMatrix', 'cafeKitchenTicket'],
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
    featureIds: ['tablesFloorPlan', 'tablesRounds', 'tablesSplitBill', 'tablesPrecheck', 'cafeKitchenBoard'],
    illustrations: ['/demo-restaurant/borscht.svg', '/demo-restaurant/ribeye.svg', '/demo-restaurant/wine-red.svg'],
    tint: 'bg-tint-restaurant',
  },
];

export function findVertical(slug: string): VerticalFact | undefined {
  return VERTICALS.find((v) => v.slug === slug);
}
