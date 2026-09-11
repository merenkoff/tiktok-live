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
      'Каса для магазину одягу — товари, штрихкоди, склад, знижки, QR-оплата, фіскалізація ПРРО через Checkbox і десктопний термінал з офлайн-режимом.',
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

export const PRICING = {
  pos: {
    price: 0,
    currency: 'UAH',
    label: 'Безкоштовно на період запуску',
    detail:
      'Зараз каса безкоштовна — на період запуску, без обмежень за кількістю кас і продажів. Коли з\'явиться платний тариф, ті, хто вже підключився, дізнаються про це першими.',
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
];

export const LIVE_FEATURE_IDS: FeatureId[] = ['tiktokLive', 'liveAiComments', 'liveStockOverlay', 'liveAnalytics'];

export function isAvailable(id: FeatureId): boolean {
  return FEATURES[id].status === 'available';
}

export function availableFeatureLabels(ids: FeatureId[]): string[] {
  return ids.filter(isAvailable).map((id) => FEATURES[id].label);
}
