import {
  ORG,
  PRODUCT,
  PRICING,
  POS_FEATURE_IDS,
  LIVE_FEATURE_IDS,
  availableFeatureLabels,
} from '../productFacts';

const provider = { '@type': 'Organization', '@id': `${ORG.url}/#organization`, name: ORG.name };

const IN_STOCK = 'https://schema.org/InStock';
const PRE_ORDER = 'https://schema.org/PreOrder';

function monthly(price: number, currency: string) {
  return {
    '@type': 'UnitPriceSpecification',
    price: String(price),
    priceCurrency: currency,
    billingDuration: 1,
    unitCode: 'MON',
  };
}

export function posSoftwareJsonLd() {
  const { pos } = PRICING;
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: PRODUCT.pos.name,
    alternateName: PRODUCT.pos.alternateName,
    applicationCategory: 'BusinessApplication',
    operatingSystem: PRODUCT.pos.operatingSystem,
    url: PRODUCT.pos.url,
    description: PRODUCT.pos.description,
    inLanguage: 'uk',
    provider,
    offers: [
      {
        '@type': 'Offer',
        name: 'Період запуску',
        price: String(pos.launch.price),
        priceCurrency: pos.currency,
        description: pos.launch.label,
        availability: IN_STOCK,
      },
      ...pos.plans.map((plan) => ({
        '@type': 'Offer',
        name: plan.name,
        price: String(plan.price),
        priceCurrency: pos.currency,
        priceSpecification: monthly(plan.price, pos.currency),
        description: `${plan.note} За магазин до ${pos.perStoreRegisters} кас. ${pos.billing} Ціна закріплюється ${plan.lock}.`,
        availability: plan.status === 'available' ? IN_STOCK : PRE_ORDER,
      })),
      ...pos.addons.map((addon) => ({
        '@type': 'Offer',
        name: addon.name,
        price: String(addon.price),
        priceCurrency: pos.currency,
        priceSpecification: monthly(addon.price, pos.currency),
        description: `Доповнення до будь-якого тарифу. ${pos.billing}`,
        availability: IN_STOCK,
      })),
    ],
    featureList: availableFeatureLabels(POS_FEATURE_IDS),
  };
}

export function liveSoftwareJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: PRODUCT.live.name,
    alternateName: PRODUCT.live.alternateName,
    applicationCategory: 'BusinessApplication',
    operatingSystem: PRODUCT.live.operatingSystem,
    url: PRODUCT.live.url,
    description: PRODUCT.live.description,
    inLanguage: 'uk',
    provider,
    offers: [
      {
        '@type': 'Offer',
        name: 'Ранній доступ',
        price: '0',
        priceCurrency: PRICING.live.currency,
        description: `Перші ${PRICING.live.trialMonths} місяців безкоштовно`,
        availability: IN_STOCK,
      },
      {
        '@type': 'Offer',
        name: 'Базовий',
        price: String(PRICING.live.price),
        priceCurrency: PRICING.live.currency,
        description: 'На місяць після пробного періоду; ціна закріплюється за першими користувачами',
        availability: IN_STOCK,
      },
    ],
    featureList: availableFeatureLabels(LIVE_FEATURE_IDS),
  };
}
