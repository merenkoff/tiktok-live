import { JsonLd } from './JsonLd';
import { buildFaqJsonLd, type FaqItem } from '../lib/faqJsonLd';

export function FaqJsonLd({ items }: { items: FaqItem[] }) {
  return <JsonLd data={buildFaqJsonLd(items)} />;
}
