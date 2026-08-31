import type { FaqItem } from '../lib/faqJsonLd';

export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className="divide-y divide-line border-y border-line">
      {items.map((item) => (
        <details key={item.q} className="group py-5">
          <summary className="flex items-center justify-between cursor-pointer list-none font-semibold text-ink">
            {item.q}
            <span className="text-muted text-xl leading-none group-open:rotate-45 transition-transform">+</span>
          </summary>
          <p className="text-muted mt-3 leading-relaxed text-sm">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
