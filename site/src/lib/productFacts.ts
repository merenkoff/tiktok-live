// Single source of truth for everything the site claims about the product:
// names, prices and per-feature status. Page copy, FAQ answers, JSON-LD and the
// generated llms.txt all read from here, so a feature flips from «у розробці»
// to «є» in one line.

export const SITE_URL = 'https://the-live.shop';
export const RELEASES_URL = 'https://github.com/merenkoff/tiktok-live/releases/latest';
// The owner's company site. Its Organization (https://technologies.llc/#organization) is the
// same legal entity as ORG below: the footer links it and the JSON-LD lists it in sameAs.
export const COMPANY_URL = 'https://technologies.llc/';

export const ORG = {
  name: 'ТОВ «Технології»',
  legalName: 'Товариство з обмеженою відповідальністю «Компанія Технології»', // as in the ЄДР extract
  alternateName: ['The Live Shop', 'LiveShop'],
  taxId: '46288273',
  url: SITE_URL,
  // GitHub stays first: AboutPage links the repository as sameAs[0].
  sameAs: ['https://github.com/merenkoff/tiktok-live', COMPANY_URL],
} as const;

export const PRODUCT = {
  pos: {
    name: 'The Live Shop POS',
    alternateName: 'LiveShop POS',
    url: `${SITE_URL}/pos`,
    operatingSystem: 'Windows, macOS, Linux',
    description:
      'Каса для магазину одягу, продуктового магазину, квіткової крамниці, кав\'ярні й ресторану — товари, штрихкоди, ваговий товар, склад, знижки, продаж під запис, QR-оплата, фіскалізація ПРРО через Checkbox і десктопний термінал з офлайн-режимом.',
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
  /**
   * What the locked price stands for, in euros a month: the hryvnia figure is
   * today's equivalent, recalculated only on a substantial UAH/EUR move.
   */
  eurAnchor?: number;
}

/**
 * A paid extra on top of a plan. `month` is billed like the plans; `once` is a
 * single payment (decision Д6, 2026-10-25: «Борги» — 400 грн один раз).
 */
export interface PosAddon {
  id: 'tables' | 'debts';
  name: string;
  /** UAH — a month for `month`, the whole price for `once`. */
  price: number;
  period: 'month' | 'once';
  /** What the add-on gives, in one line: the card and the JSON-LD offer read it. */
  note: string;
  /** Who it is for, under the card. */
  forWhom: string;
}

/** «+150 грн/міс» or «400 грн один раз» — an add-on's price in a sentence. */
export function addonPriceText(addon: Pick<PosAddon, 'price' | 'period'>): string {
  return addon.period === 'once' ? `${addon.price} грн один раз` : `+${addon.price} грн/міс`;
}

/**
 * The paid extras, ahead of `PRICING` so that its `detail` sentence names their
 * prices from here instead of typing them a second time. Tables are 150 грн a
 * month since 2026-10-25 (50 before — the owner's word that day).
 */
const POS_ADDONS = [
  {
    id: 'tables',
    name: 'Столи й офіціанти (ресторан)',
    price: 150,
    period: 'month',
    note: 'План залу, рахунки столів, раунди на кухню, передчек і розділення рахунку.',
    forWhom: 'Для ресторану з офіціантами.',
  },
  {
    id: 'debts',
    name: 'Продаж під запис («Борги»)',
    price: 400,
    period: 'once',
    note: 'Борги покупців у журналі каси замість зошита: ліміт від власника, погашення частинами з фіскальним чеком.',
    forWhom: 'Для будь-якого магазину, де беруть «до зарплати».',
  },
] satisfies PosAddon[];

/** One add-on by id — the copy that names an add-on's price reads it from here, never a typed figure. */
export function posAddon(id: PosAddon['id']): PosAddon {
  const addon = POS_ADDONS.find((a) => a.id === id);
  if (!addon) throw new Error(`No POS add-on «${id}»`);
  return addon;
}

/** «Столи й офіціанти» — a restaurant's tables, by the month. */
export const TABLES_ADDON = posAddon('tables');

/** «Борги» — sales «під запис» for any vertical, paid once (decision Д6). */
export const DEBTS_ADDON = posAddon('debts');

/** The footnote behind the «*» on a locked price: what is actually fixed is its euro equivalent. */
export function priceLockNote(plan: PosPlan): string | null {
  if (!plan.eurAnchor) return null;
  return `* ${plan.price} грн — це ≈ ${plan.eurAnchor} € на місяць, і закріплюємо ми саме їх: гривнева сума перерахується, лише якщо курс гривні до євро суттєво зміниться.`;
}

/**
 * POS pricing, decided 2026-09-23. Free during the launch, then a monthly fee
 * per STORE (up to `perStoreRegisters` registers) that depends on who does the
 * fiscalisation: an external ПРРО provider the store pays separately, or our
 * own ПРРО — which is not built yet (`FEATURES.ownPrro` says so), so its plan
 * is `coming` and its JSON-LD offer is a PreOrder. Tables are an add-on by the
 * month (150 грн since 2026-10-25); «Борги» (sales «під запис», any vertical)
 * one paid once — the owner's decision Д6 of 2026-10-25. Whoever joins now
 * keeps the price; nothing is prepaid.
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
        eurAnchor: 2,
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
    addons: POS_ADDONS,
    /**
     * The day a price here last changed: an article or a landing that prints
     * our prices says it was updated no earlier than this (`latestDay`).
     */
    changedAt: '2026-10-25',
    billing: 'Помісячно, без передплати за рік.',
    label: 'Безкоштовно на період запуску, далі від 100 грн/міс за магазин',
    detail: `Зараз каса безкоштовна — на період запуску, без обмежень за кількістю продажів. Далі — 100 грн/міс за магазин (до 4 кас) з фіскалізацією через Checkbox або 200 грн/міс із власним ПРРО, коли він вийде; столи для ресторану — ще ${TABLES_ADDON.price} грн/міс, а продаж під запис (модуль «Борги») — ${addonPriceText(DEBTS_ADDON)}. Оплата помісячно, без передплати за рік, і ціна закріплюється за тими, хто підключився на період запуску.`,
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
   * exist». Until 2026-09-30 the page printed no commission; on 2026-10-18 it
   * carries a tariff table («Які тарифи?») and a FAQ that names the POS
   * systems, recorded below exactly as printed. Figures in older press still
   * differ from each other and are still not ours to repeat.
   */
  expirenza: {
    name: 'monobank Expirenza',
    publishedAt: '2026-09-30',
    checkedAt: '2026-10-18',
    sources: {
      service: 'https://expz.monobank.ua/',
      /** mind.ua, 25.06.2024: guests do not need the monobank app, they scan a QR. */
      press: 'https://mind.ua/news/20272773-monobank-zapuskae-mobilnij-zastosunok-dlya-klientiv-kafe-bariv-i-restoraniv',
      /** kosht.media, 15.07.2024: the partnership with ChoiceQR. */
      partnership: 'https://kosht.media/choiceqr-ta-expirenza-vid-mono-ob-iednuiutsia-shcho-zminylos-dlia-kliientiv/',
    },
    /** A guest calling a waiter from the phone: not mentioned on the page or in its FAQ. */
    waiterCall: false,
    /** «3 800+ закладів по всій Україні» / «95 міст та містечок» — the service page's own figures. */
    establishments: 3800,
    cities: 95,
    /** What a guest does with the table's QR, as the service page lists it. */
    guestDoes: ['бачить цифрове меню', 'отримує рахунок в один дотик', 'платить', 'залишає чайові', 'залишає відгук', 'бронює стіл'],
    /** The page: «рахунки — з вашої POS-системи». */
    billFrom: 'з POS-системи закладу',
    /**
     * The tariff table: «Комісія за оплату — 1,3% за картками українських
     * емітентів та 2% за картками закордонних емітентів», «Щомісячне
     * обслуговування — Безкоштовно», «Оренда обладнання — Немає (QR-код) /
     * Безкоштовно (термінал)», «Чайові — 4%». The table does not say what the
     * 4 % of tips is taken for, so the article quotes the row as it stands.
     */
    commissionUaCardsPercent: 1.3,
    commissionForeignCardsPercent: 2,
    tipsRowPercent: 4,
    /** FAQ «З якими POS-системами працює Expirenza?» — the list as printed. */
    posIntegrations: ['Syrve', 'r-keeper', 'Poster', 'Servio', 'SmartTouch', 'LunchPOS', 'BarBoss', 'SkyService', 'Profit Solutions', 'Trio POS', 'TurboPos', 'Libro'],
    /** FAQ: «Наш улюблений кейс — підключення за 2 години». */
    connectHours: 2,
  },
  /**
   * ChoiceQR — read on `checkedAt`: the Ukrainian page (products and named
   * integrations), the English page for what only it lists (bill splitting,
   * delivery and pickup) and the tariff page. On 2026-09-30 the tariff page's
   * prices did not render for us; on 2026-10-18 they did, rendered in a
   * browser and read for each of its three billing periods — the page opens on
   * the 12-month one, so its first figures are NOT the monthly price. The
   * 14-day trial the first read recorded is no longer printed anywhere we
   * read; «Спробувати безкоштовно» and a free Basic tariff are.
   */
  choiceqr: {
    name: 'ChoiceQR',
    publishedAt: '2026-09-30',
    checkedAt: '2026-10-18',
    sources: {
      ua: 'https://choiceqr.com/uk',
      en: 'https://choiceqr.com/',
      tariffs: 'https://choiceqr.com/uk/pricing/',
      /** kosht.media, 15.07.2024: ChoiceQR ↔ Expirenza. */
      partnership: 'https://kosht.media/choiceqr-ta-expirenza-vid-mono-ob-iednuiutsia-shcho-zminylos-dlia-kliientiv/',
    },
    /** A guest calling a waiter: not mentioned on the pages or the tariffs («Чайові офіціантам» is marked «незабаром»). */
    waiterCall: false,
    /** «25 000+ закладів вже з Choice» у «25+ країнах світу». */
    establishments: 25000,
    countries: 25,
    /** Products the Ukrainian page names (among others: delivery site, marketplaces, CRM, reservations, reviews). */
    products: ['Онлайн-меню', 'Замовлення до столу', 'Оплата по QR коду'],
    /**
     * «Одна локація» tariffs, UAH per month: billed monthly, for 6 months
     * (−10 %) and for 12 months (−20 %). Basic is free with «Мінімум 100
     * замовлень/місяць» and a commission on delivery and pickup orders.
     * `tableOrders` — «QR-замовлення до столу» is in the tariff (from
     * Standard); on Basic it is an add-on for `tableOrdersAddonUah`.
     */
    plans: [
      { id: 'Basic', monthlyUah: 0, sixMonthUah: 0, annualUah: 0, tableOrders: false },
      { id: 'Standard', monthlyUah: 1700, sixMonthUah: 1530, annualUah: 1360, tableOrders: true },
      { id: 'Smart', monthlyUah: 2750, sixMonthUah: 2475, annualUah: 2200, tableOrders: true },
      { id: 'Pro', monthlyUah: 4200, sixMonthUah: 3780, annualUah: 3360, tableOrders: true },
    ],
    /** «QR-замовлення до столу — 500 грн / місяць: самостійне замовлення та дозамовлення через QR-меню без участі офіціанта». */
    tableOrdersAddonUah: 500,
    /** «Налаштування функціоналу» — once, from Basic to Pro. */
    setupUah: [1500, 1500, 2500, 3000],
    /** «При оплаті на розрахунковий рахунок +20% ПДВ». */
    vatOnTransferPercent: 20,
    /** Cash-register programs the Ukrainian page names as integrations. */
    posIntegrations: ['Poster', 'Syrve', 'Servio', 'Profit', 'R-Keeper'],
  },
  /**
   * RestoApp by Binotel — read on `checkedAt`: the product's own page (its
   * functions, the one tariff, the setup steps), the card ТОВ «Бінотел» filled
   * in on the Дія.Бізнес IT-market (the only place the price is printed WITH
   * its unit — the landing shows a bare «999» under «Тариф за один заклад»)
   * and the staff app's App Store page. Same rule as above: «not mentioned»
   * means not mentioned on those pages, never «does not exist». Neither page
   * prints how long the free trial lasts («Спробувати безкоштовно», «Trial»),
   * so no length is recorded, whatever an ad says.
   */
  restoapp: {
    name: 'RestoApp',
    vendor: 'Binotel',
    publishedAt: '2026-10-15',
    checkedAt: '2026-10-18',
    sources: {
      site: 'https://restoapp.binotel.ua/',
      diia: 'https://business.diia.gov.ua/it-market/restoapp',
      staffApp: 'https://apps.apple.com/ua/app/restoapp-biz/id6743811951',
    },
    /** «999 грн\місяць за один заклад» — the Дія.Бізнес card. */
    priceUah: 999,
    /** «+3 місяці у подарунок (при підключенні першого)» — the landing. */
    giftMonths: 3,
    /** «Знижка -10% за промокодом Diia» — the Дія.Бізнес card. */
    diiaDiscountPercent: 10,
    /** The only cash-register program either page names. */
    posIntegrations: ['Poster POS'],
    /** «Виклик офіціанта в 1 клік — Ваша кнопка для виклику офіціанта прямо в меню. Один клік — і офіціант знає, який столик потребує уваги.» */
    waiterCall: true,
  },
  /**
   * Poster QR — read on `checkedAt`. It is an add-on of the Poster POS
   * cash register rather than a service of its own, so the price that matters
   * is the tariff under it: the Ukrainian pricing page for cafés and
   * restaurants, read from its markup — its «Оплата за рік» switch only
   * toggles which of two prices is visible, and its comparison table marks
   * each row per tariff as included, «Доступно як додатковий модуль» or
   * absent. The English knowledge-base page is the only one that mentions
   * allergens. Same rule as above: «not mentioned» means not mentioned on
   * those pages, never «does not exist».
   */
  posterqr: {
    name: 'Poster QR',
    vendor: 'Poster',
    publishedAt: '2026-10-15',
    checkedAt: '2026-10-18',
    sources: {
      page: 'https://joinposter.com/ua/applications/poster-qr',
      pageEn: 'https://joinposter.com/en/applications/poster-qr',
      pricing: 'https://joinposter.com/ua/pricing',
      kb: 'https://knowledge-base.joinposter.com/en/what-is-poster-qr',
    },
    /** «За 280 грн/міс» — the add-on itself, on top of a Poster tariff. */
    priceUah: 280,
    /** «Комісія за послуги еквайрингу: 1,3% — від суми рахунка, 1,7% — від суми чайових». */
    billCommissionPercent: 1.3,
    tipsCommissionPercent: 1.7,
    /** A guest calling a waiter: not mentioned on either language page or the knowledge-base article. */
    waiterCall: false,
    /** «15 днів безкоштовно» on the pricing page, «free for the first 15 days» on the English one. */
    trialDays: 15,
    /**
     * Poster POS tariffs for cafés and restaurants, UAH per month: billed
     * monthly, and per month when paid for a year. `qrAddon` — Poster QR can be
     * added (it is absent on Starter); `items` — «К-ть товарів та тех. карток».
     */
    posPlans: [
      { id: 'Starter', monthlyUah: 600, annualUah: 540, qrAddon: false, floorPlan: false, modifiers: false, items: 50 },
      { id: 'Mini', monthlyUah: 1200, annualUah: 1080, qrAddon: true, floorPlan: true, modifiers: false, items: 100 },
      { id: 'Business', monthlyUah: 1700, annualUah: 1530, qrAddon: true, floorPlan: true, modifiers: true, items: 300 },
      { id: 'Pro', monthlyUah: 2400, annualUah: 2160, qrAddon: true, floorPlan: true, modifiers: true, items: 1500 },
    ],
    /** «У кожен тариф уже включено одну касу»; «Додаткова каса — 760 ₴» (printed without a period). */
    extraRegisterUah: 760,
    /** «Ціна за одну касу з ПРРО — 200 ₴/міс», an add-on on every tariff. */
    prroUah: 200,
    /** Kitchen Kit, «за один кухонний екран», an add-on from Business. */
    kitchenScreenUah: 280,
    /** Poster Site, «Сайт для замовлень» — delivery and pickup. */
    siteUah: 760,
  },
  /**
   * Торгсофт — read on `checkedAt`: the home page (its feature list, where
   * «Реалізація товару в борг» stands), its page for grocery shops, the
   * licence and option price lists, the pages of the scales, ПРРО and mobile
   * app options, and three of its own articles on customer debts — the one
   * that says which licences carry the debt mode at all («Торгсофт-Старт:
   * режим продажу в борг відсутній»), the guide to it and the one on
   * fiscalising a debt through ПРРО. A Windows program bought per workplace;
   * scales, ПРРО and reminders are options, most of them paid yearly per
   * device. Same rule as above: «not mentioned» means not mentioned on those
   * pages, never «does not exist». Торгсофт-Онлайн, the subscription edition,
   * prints two different starting prices on two of its pages, so none is
   * recorded.
   */
  torgsoft: {
    name: 'Торгсофт',
    publishedAt: '2026-10-23',
    checkedAt: '2026-10-25',
    sources: {
      home: 'https://torgsoft.ua/',
      grocery: 'https://torgsoft.ua/soft/grocery/',
      licenses: 'https://torgsoft.ua/price/licenses/',
      options: 'https://torgsoft.ua/price/options/',
      scales: 'https://torgsoft.ua/options/scales/',
      prro: 'https://torgsoft.ua/options/prro/',
      app: 'https://torgsoft.ua/options/app/',
      debts: 'https://torgsoft.ua/articles/guide/customer-debts/',
      debtors: 'https://torgsoft.ua/support/crm-marketing/debtors-control/',
      debtFiscalization: 'https://torgsoft.ua/support/ppo/debt-fiscalization/',
    },
    /** «Програма Торгсофт встановлюється на комп'ютер з Windows». */
    platform: 'Windows',
    /**
     * One workplace, UAH: «Безстрокова» (paid once) and «Оренда на 1 рік».
     * `debts` — the licence carries the debt mode for «VIP-клієнти»; the
     * debtors article: «Торгсофт-Старт: режим продажу в борг відсутній»,
     * «Торгсофт-Ультра та Термінальна: функціонал роботи з VIP-клієнтами,
     * кредитними лімітами та розшифровкою заборгованості включено». The
     * terminal edition's price includes «+ 3 клієнтських підключення».
     */
    licences: [
      { id: 'Старт', perpetualUah: 8850, yearUah: 4780, debts: false },
      { id: 'Ультра', perpetualUah: 17990, yearUah: 9720, debts: true },
      { id: 'Термінал', perpetualUah: 41000, yearUah: 22140, debts: true },
    ],
    /** «Програмний РРО», UAH a year, bought «на кожне робоче місце (касу), де відбувається фіскалізація». */
    prroYearUah: 3990,
    /** «Торгсофт не працює зі сторонніми ПРРО». */
    thirdPartyPrro: false,
    /** «Інтеграція з вагами на касі», UAH a year, bought «на кожен комп’ютер або пристрій». */
    tillScalesYearUah: 3790,
    /** The scales page's «Сумісне обладнання», every make in its order (the Ukrainian ones first). */
    scaleBrands: ['Промприлад', 'AXIS', 'Дніпровес', 'ІКС-Маркет', 'VAGAR', 'BTHE', 'CAS', 'Digi', 'Datalogic', 'Aclas', 'Mettler Toledo', 'Dibal', 'Штрих-принт'],
    /** «Фасування та маркування вагового товару» («з вагами з чекодруком і друком власних штрихкодів»), UAH a year per device. */
    labelScalesYearUah: 3870,
    /** «Масові розсилки клієнтам» — what sends the debt reminders by SMS, Viber and e-mail; UAH a year per workplace of Ультра. */
    mailingsYearUah: 3990,
    /** «Мобільний додаток Торгсофт», UAH per device, no period printed; it works with the base through the shop's server over the internet. */
    mobileAppUah: 4590,
    /** «Торгсофт-Гібрид: продажі без інтернету для віддаленого сервера», UAH per client connection. */
    hybridUah: 2480,
    /** «Демоверсія на 30 днів». */
    demoDays: 30,
  },
  /**
   * Posbox by Checkbox — read on `checkedAt`: its site (the home page, the
   * tariffs, the page for grocery shops and minimarkets) and its public
   * knowledge base, all 159 of whose Ukrainian pages were searched for
   * debts and for work without the internet; neither is mentioned. The
   * tariff page prices extras through a calculator whose rules come from the
   * page's own script (500 goods in the price, +18 ₴ for each thousand begun
   * above that). The same script carries a second price set the page did not
   * show on `checkedAt` (Business 798 ₴, Pro 1 200 ₴, with a promotional price
   * for Checkbox clients until 31.12.2026): re-read the tariffs before
   * relying on the figures below. Same rule as above: «not mentioned» means
   * not mentioned on those pages, never «does not exist».
   */
  posbox: {
    name: 'Posbox',
    vendor: 'Checkbox',
    publishedAt: '2026-10-23',
    checkedAt: '2026-10-25',
    sources: {
      site: 'https://posbox.ai/',
      prices: 'https://posbox.ai/prices/',
      grocery: 'https://posbox.ai/markets/',
      weighed: 'https://wiki.posbox.ai/uk/goods/by_weight',
      scales: 'https://wiki.posbox.ai/uk/devices/scale_list',
      fiscalDown: 'https://wiki.posbox.ai/uk/selling/fiscalization_is_temporarily_unavailable',
      excise: 'https://wiki.posbox.ai/uk/selling/excise_tax',
      /** Checkbox's own post: «каса вже включена у вартість рішення». */
      blog: 'https://checkbox.ua/blog/posbox-zruchna-alternatyva-1c-ta-bas/',
    },
    /**
     * UAH a month, each «(Місяць безкоштовно)»; one outlet and one register are
     * in the price, with the Checkbox ПРРО. `stock` — «Складський облік»
     * (receiving, stocktake, write-off) is in the tariff; Start, «Тільки для
     * клієнтів Checkbox», carries «Товари — до 500 найменувань» and no stock.
     */
    plans: [
      { id: 'Start', monthlyUah: 348, stock: false },
      { id: 'Business', monthlyUah: 549, stock: true },
      { id: 'Pro', monthlyUah: 849, stock: true },
    ],
    /** Start: «Товари — до 500 найменувань». */
    startGoodsLimit: 500,
    /** The calculator of Business and Pro: goods in the price, then a step and its price a month. */
    goodsIncluded: 500,
    goodsStep: 1000,
    goodsStepUah: 18,
    /** «Додаткова каса (+249₴)», «Торгові точки (+519₴)». */
    extraRegisterUah: 249,
    extraOutletUah: 519,
    /** «Фіскалізація з ПРРО Checkbox уже включена». */
    prroIncluded: true,
    /** The grocery page: «Усе в хмарі: працює всюди, де є інтернет». */
    cloud: true,
    /** Scales «через протокол METTLER TOLEDO», connected through their POSPort program. */
    scaleBrands: ['CAS', 'Acom', 'Mettler Toledo', 'Vagar', 'Дніпровес', 'Промприлад'],
    /** Weight barcodes «у якому вже закодована кількість товару», prefixes as printed. */
    weightBarcodePrefixes: ['20', '21', '22', '23'],
  },
  /**
   * Poster for shops — read on `checkedAt`: the retail tariff page («Тарифи
   * Poster для магазинів»), read from its markup the same way as the café one
   * above (every row of its comparison table is ticked, marked «Доступно як
   * додатковий модуль» or empty, per tariff), and the «Poster для магазину»
   * page. That page prints «Ціна за одну касу з ПРРО — 5 ₴/міс» from a price
   * element without its Ukrainian figure; the tariff page's 200 ₴ is the one
   * recorded. Neither page mentions selling on credit or weight barcodes from
   * label scales.
   */
  posterretail: {
    name: 'Poster',
    publishedAt: '2026-10-23',
    checkedAt: '2026-10-25',
    sources: {
      pricing: 'https://joinposter.com/ua/pricing-retail',
      shop: 'https://joinposter.com/ua/business/shop',
    },
    /**
     * UAH a month, billed monthly and per month when paid for a year; `items` —
     * «Кількість товарів»; `stocktake` — «Інвентаризації» is ticked (from Mini).
     */
    plans: [
      { id: 'Starter', monthlyUah: 600, annualUah: 540, items: 500, stocktake: false },
      { id: 'Mini', monthlyUah: 1200, annualUah: 1080, items: 1000, stocktake: true },
      { id: 'Business', monthlyUah: 1700, annualUah: 1530, items: 3000, stocktake: true },
      { id: 'Pro', monthlyUah: 2400, annualUah: 2160, items: 15000, stocktake: true },
    ],
    /** «Ціна за одну касу з ПРРО — 200 ₴/міс», an add-on on every tariff. */
    prroUah: 200,
    /** «Додаткова каса — 760 ₴» (printed without a period); offered from `extraRegisterFrom`, Starter's cell is empty. */
    extraRegisterUah: 760,
    extraRegisterFrom: 'Mini',
    trialDays: 15,
    /** The FAQ «Чи можна підключити ваги до Poster?». */
    recommendedScale: 'ВІС Промприлад BTA-60/15-5D-AC',
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
  cashRounding: {
    status: 'available',
    label: 'Заокруглення готівки до 10 або 50 копійок за постановою НБУ № 25: рядки «Заокруглення» і «До сплати» в чеку, картка — до копійки',
  },
  offlineDesktop: { status: 'available', label: 'Десктопна каса, що продає без інтернету' },
  stocktakeOffline: { status: 'available', label: 'Інвентаризація на касі сканером, навіть офлайн' },
  qrPayment: { status: 'available', label: 'QR-оплата на касі з автоматичним підтвердженням' },
  gtinLookup: { status: 'available', label: 'Розпізнавання товару по штрихкоду через GTIN-довідники' },
  clothingVariants: { status: 'available', label: 'Облік одягу за розміром і кольором на рівні варіантів' },
  floristBench: { status: 'available', label: 'Стіл флориста: «Зібрати букет» зі стебел із підрахунком ціни й роботи' },
  floristShowcase: { status: 'available', label: 'Букет на вітрину з власним цінником і списанням стебел' },
  floristPreorders: { status: 'available', label: 'Передзамовлення букетів з датою видачі, адресою й листівкою' },
  floristAnalytics: { status: 'available', label: 'Аналітика флориста: списання, частка букетів, реалізована націнка' },
  cafeModifiers: { status: 'available', label: 'Модифікатори: розмір, молоко, сироп, соус — ціна рахується сама, доплата може залежати від розміру' },
  cafeTechCards: { status: 'available', label: 'Техкарти з фудкостом, рецепт у рецепті' },
  cafeKitchenBoard: { status: 'available', label: 'Дошка кухні та бару: «Готово» → «Видано», стоп-лист на день' },
  cafeKitchenTicket: { status: 'available', label: 'Кухонний тікет на принтер станції (десктоп-каса)' },
  cafeMenuMatrix: { status: 'available', label: 'Матриця меню, середній чек, замовлення за годинами' },
  qrMenu: { status: 'available', label: 'QR-меню для гостей зі стоп-листом наживо' },
  qrMenuTables: { status: 'available', label: 'QR на кожен стіл із номером столу й лист QR для друку' },
  qrMenuProfile: { status: 'available', label: 'Профіль закладу в QR-меню: логотип, адреса, телефон і години роботи' },
  dishAllergens: { status: 'available', label: 'Склад і алергени страв у QR-меню: 14 позицій за переліком ЄС, які вказує власник' },
  guestBill: { status: 'available', label: 'Рахунок столу на телефоні гостя: що вже на кухні й сума до сплати' },
  guestOrder: {
    status: 'available',
    label: 'Замовлення й дозамовлення гостя з телефону: за замовчуванням офіціант приймає одним тапом, до цього нічого не йде на кухню й склад',
  },
  guestAutoKitchen: {
    status: 'available',
    label: 'Замовлення гостя одразу на кухню й бар — за вибором власника: лише дозамовлення або всі, до ліміту суми; офіціант отримує сповіщення',
  },
  waiterCall: {
    status: 'available',
    label: 'Виклик офіціанта й прохання принести рахунок з телефону гостя: офіціант бачить стіл на плані залу, чує сигнал і відповідає «Іду»',
  },
  tablesFloorPlan: { status: 'available', label: 'План залу з відкритими рахунками столів' },
  tablesRounds: { status: 'available', label: 'Раунди на кухню: ціна замикається, склад списується при відправці' },
  tablesPrecheck: { status: 'available', label: 'Передчек на принтері (десктоп-каса)' },
  tablesSplitBill: { status: 'available', label: 'Розділити рахунок: за стравами або порівну' },
  waiterTablet: { status: 'available', label: 'Планшет офіціанта як застосунок: відкривається без мережі й показує зал, рахунки й меню' },
  ownPrro: { status: 'coming', label: 'Власний ПРРО без стороннього провайдера' },
  // The grocery vertical (TechDocs/grocery/README.md); each line here turns
  // `available` with its own phase. «Під запис» shipped first, on 2026-10-24
  // (`pos-v2.6.0` + `module-debts-v2.6.0`), as the `debts` module — for every
  // vertical by the owner's decision Д1, presented under «Продукти». What it
  // does not do yet (the customer's own statement, reminders — phase Г7) is the
  // ROADMAP item `grocery-credit-reminders`. Weighed goods followed with phase
  // Г4 (`pos-v2.6.3` + `module-vertical-grocery-v2.6.3`), and with them the
  // landing left «Скоро» (decision Д14). The weight is typed by hand: label
  // scales and a scale at the till are their own phases (Г6, Г9) and stay
  // `coming` — `groceryScaleLabels` and the ROADMAP items.
  groceryCredit: {
    status: 'available',
    label:
      'Продаж під запис (модуль «Борги»): борг покупця в журналі каси замість зошита — ліміт від власника, погашення частинами, виписка, фіскальний чек при оплаті; на десктопі записує й без інтернету',
  },
  groceryWeighed: {
    status: 'available',
    label:
      'Ваговий товар: ціна за 1 кг (на розлив — за 1 л), вага в чеку до грама з позначкою «вагу введено вручну», на цінику — ціна за 1 кг і за 100 г',
  },
  groceryScaleLabels: { status: 'coming', label: 'Ваги з друком етикеток: каса читає вагу й ціну зі штрихкоду наліпки' },
  groceryPhone: { status: 'coming', label: 'Каса на телефоні для торгівлі на ринку: продаж, борги покупців і залишки з одного екрана' },
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
  'cashRounding',
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
  'qrMenuProfile',
  'dishAllergens',
  'guestBill',
  'guestOrder',
  'guestAutoKitchen',
  'waiterCall',
  'tablesFloorPlan',
  'tablesRounds',
  'tablesPrecheck',
  'tablesSplitBill',
  'waiterTablet',
  'ownPrro',
  'groceryCredit',
  'groceryWeighed',
  'groceryScaleLabels',
  'groceryPhone',
];

export const LIVE_FEATURE_IDS: FeatureId[] = ['tiktokLive', 'liveAiComments', 'liveStockOverlay', 'liveAnalytics'];

export function isAvailable(id: FeatureId): boolean {
  return FEATURES[id].status === 'available';
}

export function availableFeatureLabels(ids: FeatureId[]): string[] {
  return ids.filter(isAvailable).map((id) => FEATURES[id].label);
}

export type VerticalId = 'clothing' | 'flowers' | 'cafe' | 'restaurant' | 'grocery';

export interface VerticalFact {
  id: VerticalId;
  /**
   * `coming` — the vertical is not in the code yet: its landing is a «Скоро»
   * page that may promise (through `ROADMAP`) but never says it works, and the
   * menus and cards that list what the POS sells leave it out or mark it.
   */
  status: FeatureStatus;
  /** URL slug under /pos/. */
  slug: string;
  path: string;
  /** Short name for menus and cards. */
  title: string;
  /** «Каса для …» — the page's eyebrow and the card's subtitle. */
  eyebrow: string;
  tagline: string;
  bullets: readonly [string, string, string];
  /**
   * The feature each bullet names, in the same order, so a card ticks only the
   * bullets whose feature is `available` and keeps a hollow bullet on the rest
   * — a «Скоро» vertical's bullets start working one at a time, and a working
   * vertical's card must never tick a promise. Without it every bullet of a
   * «Скоро» card is a promise, and every bullet of a working one works.
   */
  bulletFeatureIds?: readonly [FeatureId, FeatureId, FeatureId];
  featureIds: FeatureId[];
  /** Flat SVGs from the demo stores, served from /public. */
  illustrations: readonly string[];
  /** Tailwind colour token for the card background. */
  tint: string;
  /**
   * `false` while the owner has not decided whether this vertical's ROADMAP
   * comes with the launch tariff («Усі нові функції — у тарифі перших»). Its
   * promises are then listed in its own section of llms.txt rather than under
   * «входить у тариф перших користувачів», and its landing's «Скоро» cards get
   * a heading that promises no price (TechDocs/GROCERY_SEO_AEO.md, «Що вирішити
   * власнику»). A «Скоро» vertical is treated the same way regardless.
   */
  roadmapInLaunchTariff?: false;
}

/**
 * The five businesses the POS is sold to, plus any it is being built for
 * (`status: 'coming'`). A restaurant is the café vertical plus the tables
 * module rather than a vertical of its own in code, but for a buyer it is a
 * different shop, so it gets its own page.
 */
export const VERTICALS: readonly VerticalFact[] = [
  {
    id: 'clothing',
    status: 'available',
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
    status: 'available',
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
    status: 'available',
    slug: 'kafe',
    path: '/pos/kafe',
    title: 'Кафе',
    eyebrow: 'Програма для кав\'ярні за стійкою',
    tagline: 'Тап — і «як завжди»; модифікатори, дошка кухні, стоп-лист, техкарти з фудкостом і матриця меню.',
    bullets: ['Модифікатори з ціною на кнопці', 'Дошка кухні й бару, стоп-лист', 'Техкарти й фудкост'],
    featureIds: ['cafeModifiers', 'cafeKitchenBoard', 'cafeTechCards', 'cafeMenuMatrix', 'cafeKitchenTicket', 'qrMenu', 'qrMenuProfile', 'dishAllergens'],
    illustrations: ['/demo-cafe/latte.svg', '/demo-cafe/croissant.svg', '/demo-cafe/espresso.svg'],
    tint: 'bg-tint-cafe',
  },
  {
    id: 'restaurant',
    status: 'available',
    slug: 'restoran',
    path: '/pos/restoran',
    title: 'Ресторан',
    eyebrow: 'Програма для ресторану зі столами',
    tagline: 'План залу, відкриті рахунки, раунди на кухню, передчек і розділення рахунку — з планшета офіціанта.',
    bullets: ['План залу з рахунками столів', 'Раунди на кухню з планшета', 'Розділити рахунок, передчек'],
    featureIds: ['tablesFloorPlan', 'tablesRounds', 'tablesSplitBill', 'tablesPrecheck', 'cafeKitchenBoard', 'qrMenu', 'qrMenuTables', 'qrMenuProfile', 'dishAllergens', 'guestBill', 'guestOrder', 'waiterCall', 'guestAutoKitchen', 'waiterTablet'],
    illustrations: ['/demo-restaurant/borscht.svg', '/demo-restaurant/ribeye.svg', '/demo-restaurant/wine-red.svg'],
    tint: 'bg-tint-restaurant',
  },
  {
    // Built around «під запис» by the owner's decision of 2026-10-23; the
    // resume point for its copy and search terms is TechDocs/GROCERY_SEO_AEO.md.
    // `available` since weighed goods shipped with their demo store (decision
    // Д14, phase Г4); the phone till stays a promise, so the card's bullets
    // name only what works — an available card ticks every one it shows.
    id: 'grocery',
    status: 'available',
    slug: 'produkty',
    path: '/pos/produkty',
    title: 'Продукти',
    eyebrow: 'Каса для продуктового магазину',
    tagline:
      'Продаж під запис замість зошита боргів — для будь-якого магазину — і ваговий товар із ціною за кілограм уже працюють; каса на телефоні для ринку — у розробці.',
    bullets: ['Продаж під запис замість зошита', 'Ваговий товар із ціною за кілограм', 'Продає без світла й інтернету'],
    bulletFeatureIds: ['groceryCredit', 'groceryWeighed', 'offlineDesktop'],
    featureIds: [
      'groceryCredit',
      'groceryWeighed',
      'groceryScaleLabels',
      'groceryPhone',
      'fiscalOnlineCheckbox',
      'fiscalOffline',
      'cashRounding',
      'offlineDesktop',
      'gtinLookup',
      'stocktakeOffline',
      'qrPayment',
    ],
    illustrations: ['/demo-grocery/cheese.svg', '/demo-grocery/potato.svg', '/demo-grocery/milk.svg'],
    tint: 'bg-tint-grocery',
    roadmapInLaunchTariff: false,
  },
];

/** What the POS sells today — the menus, the «Для якого бізнесу» copy and anything that says «вже працює». */
export const AVAILABLE_VERTICALS: readonly VerticalFact[] = VERTICALS.filter((v) => v.status === 'available');

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
    // Phase Г4 sells by weight in the grocery vertical only (`weighedUnits`); a
    // café's grams stay ingredients priced per gram, and no scale is connected
    // anywhere yet (Г6, Г9) — so the promise stands, widened, never deleted.
    id: 'scales',
    vertical: 'cafe',
    title: 'Вагові товари з ваг',
    body: 'Салат-бар і випічка на вагу: підключені ваги, дробова кількість, ціна за 100 г. У продуктовому магазині ваговий товар уже продається — ціна за кілограм, вага до грама в чеку, набрана на касі вручну; для кав\'ярні й для ваг, підключених до каси, — у роботі.',
    progress: 40,
  },
  {
    id: 'reservations',
    vertical: 'restaurant',
    title: 'Бронювання столів',
    body: 'Бронь на час із телефону гостя, стіл підсвічується на плані залу за годину до приходу.',
    progress: 15,
  },
  {
    id: 'guest-pay',
    vertical: 'restaurant',
    title: 'Оплата рахунку столу з телефону',
    body: 'Гість платить свій рахунок за QR-кодом столу, а чек фіксується так само, як на касі. Фіскалізація оплати рахунків столу вже працює: кожна частина рахунку реєструється в ПРРО; лишилось прийняти оплату від самого гостя.',
    progress: 25,
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
    body: 'Прийняти замовлення на терасі, де не ловить Wi-Fi, і відправити на кухню, щойно зв\'язок повернеться. Відкриватися без мережі й показувати зал, рахунки й меню планшет, доданий на екран, уже вміє; лишилось записувати.',
    progress: 10,
  },
  // The grocery vertical (owner's decision 2026-10-23: «під запис» first). «Під
  // запис» itself shipped on 2026-10-24 and left this list (it is
  // `FEATURES.groceryCredit` now); what it promised and does not do yet — the
  // customer's own statement and reminders, phase Г7 of TechDocs/grocery/PLAN.md
  // — stays here as `grocery-credit-reminders`. Weighed goods left it the same
  // way with phase Г4 (`FEATURES.groceryWeighed`); what that promise said and Г4
  // does not do — a scale's label read at the till, a scale at the till itself —
  // was already promised on its own below. The other figures are where the
  // work is: research done (TechDocs/grocery/), no code.
  {
    id: 'grocery-credit-reminders',
    vertical: 'grocery',
    title: 'Виписка й нагадування для покупця',
    body: 'Покупець бачить свій борг у телефоні — що брав, коли, скільки погасив і скільки лишилось — і підтверджує записи, щоб борг можна було довести. Нагадування про борг — лише тим, хто погодився їх отримувати. Сам продаж під запис уже працює: журнал боргу, ліміт, погашення з фіскальним чеком; виписку зараз видно на екрані каси.',
    progress: 10,
  },
  {
    id: 'grocery-scale-labels',
    vertical: 'grocery',
    title: 'Ваги з друком етикеток',
    body: 'Зважили на вагах, наклеїли етикетку — каса читає вагу й ціну зі штрихкоду наліпки. Формат коду налаштовується під ваші ваги, список товарів і цін вивантажується для них.',
    progress: 5,
  },
  {
    id: 'grocery-till-scales',
    vertical: 'grocery',
    title: 'Ваги на касі',
    body: 'Товар на ваги біля каси — і вага сама стає в чек, щойно показ стабільний. Поки ваги підключені, вписати вагу руками не можна.',
    progress: 5,
  },
  {
    id: 'grocery-phone',
    vertical: 'grocery',
    title: 'Каса на телефоні для ринку',
    body: 'Продати, записати борг і подивитися залишки з телефона — для торгівлі на ринку, з лотка й з виїзду, без окремого комп\'ютера.',
    progress: 10,
  },
  {
    id: 'grocery-excise',
    vertical: 'grocery',
    title: 'Підакцизні товари',
    body: 'Сканування акцизної марки на кожну пляшку, код УКТ ЗЕД у рядку чека і підтвердження віку покупця один раз на чек.',
    progress: 5,
  },
];

export function roadmapFor(vertical: VerticalId): RoadmapItem[] {
  return ROADMAP.filter((item) => item.vertical === vertical);
}

export function findVertical(slug: string): VerticalFact | undefined {
  return VERTICALS.find((v) => v.slug === slug);
}
