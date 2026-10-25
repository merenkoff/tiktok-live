import type { ReactNode } from 'react';
import type { FaqItem } from '../lib/faqJsonLd';
import { Plus } from './glyphs';

/**
 * A site path inside an answer («Докладно — /dovidka/…») becomes a link. The
 * answers stay plain strings — `FaqItem.a` is also what the FAQPage JSON-LD
 * prints — so this is the one place a path in one turns into an anchor. The
 * segments take ASCII word characters and dashes only, so a sentence's dot or
 * comma after the path stays outside it.
 */
const PATH_RE = /(\/(?:pos|dovidka|live|about|yaku-kasu-obraty|m)(?:\/[\w-]+)*(?:#[\w-]+)?)/g;

function linkify(text: string): ReactNode {
  const parts = text.split(PATH_RE);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} className="text-pos font-semibold hover:underline underline-offset-2">
        {part}
      </a>
    ) : (
      part
    )
  );
}

export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className="card px-6 divide-y divide-line">
      {items.map((item) => (
        <details key={item.q} className="group py-5">
          <summary className="flex items-center justify-between gap-4 cursor-pointer list-none font-semibold text-ink [&::-webkit-details-marker]:hidden">
            {item.q}
            <Plus size={20} className="text-faint shrink-0 transition-transform group-open:rotate-45" />
          </summary>
          <p className="text-muted mt-3 leading-relaxed text-[15px]">{linkify(item.a)}</p>
        </details>
      ))}
    </div>
  );
}
