// Built by scripts/guides-plugin.mjs from TechDocs/guides/*.md, keyed by file name.
declare module 'virtual:guides' {
  import type { FaqItem } from './lib/faqJsonLd';
  import type { Heading } from './content/dovidka/types';

  export interface GuideSource {
    title: string;
    html: string;
    faq: FaqItem[];
    headings: Heading[];
    readingMinutes: number;
  }
  const guides: Record<string, GuideSource>;
  export default guides;
}
