import type { FaqItem } from '../lib/faqJsonLd';
import { Plus } from './glyphs';

export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className="card px-6 divide-y divide-line">
      {items.map((item) => (
        <details key={item.q} className="group py-5">
          <summary className="flex items-center justify-between gap-4 cursor-pointer list-none font-semibold text-ink [&::-webkit-details-marker]:hidden">
            {item.q}
            <Plus size={20} className="text-faint shrink-0 transition-transform group-open:rotate-45" />
          </summary>
          <p className="text-muted mt-3 leading-relaxed text-[15px]">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
