import { ReactNode } from 'react';
import { Reveal } from './Reveal';
import { Check } from './glyphs';

interface Props {
  eyebrow: string;
  title: string;
  body: string;
  bullets?: string[];
  accentClass: string; // e.g. 'text-live' or 'text-pos'
  visual?: ReactNode;
  reverse?: boolean;
}

export function FeatureRow({ eyebrow, title, body, bullets, accentClass, visual, reverse }: Props) {
  return (
    <Reveal>
      <div className={`grid md:grid-cols-2 gap-10 md:gap-16 items-center py-14 ${reverse ? 'md:[&>*:first-child]:order-2' : ''}`}>
        <div>
          <p className={`eyebrow ${accentClass}`}>{eyebrow}</p>
          <h3 className="text-2xl sm:text-3xl font-bold tracking-[-0.015em] text-ink-strong mt-2">{title}</h3>
          <p className="text-body mt-4 leading-relaxed">{body}</p>
          {bullets && (
            <ul className="mt-5 space-y-2.5">
              {bullets.map((b) => (
                <li key={b} className="flex items-start gap-2 text-[15px] text-body">
                  <Check size={20} className={`shrink-0 ${accentClass}`} />
                  {b}
                </li>
              ))}
            </ul>
          )}
        </div>
        {visual && <div>{visual}</div>}
      </div>
    </Reveal>
  );
}
