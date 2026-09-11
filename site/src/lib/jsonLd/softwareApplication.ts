import {
  ORG,
  PRODUCT,
  PRICING,
  POS_FEATURE_IDS,
  LIVE_FEATURE_IDS,
  availableFeatureLabels,
} from '../productFacts';

const provider = { '@type': 'Organization', '@id': `${ORG.url}/#organization`, name: ORG.name };

export function posSoftwareJsonLd() {
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
    offers: {
      '@type': 'Offer',
      price: String(PRICING.pos.price),
      priceCurrency: PRICING.pos.currency,
      description: PRICING.pos.label,
      availability: 'https://schema.org/InStock',
    },
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
        availability: 'https://schema.org/InStock',
      },
      {
        '@type': 'Offer',
        name: 'Базовий',
        price: String(PRICING.live.price),
        priceCurrency: PRICING.live.currency,
        description: 'На місяць після пробного періоду; ціна закріплюється за першими користувачами',
        availability: 'https://schema.org/InStock',
      },
    ],
    featureList: availableFeatureLabels(LIVE_FEATURE_IDS),
  };
}
