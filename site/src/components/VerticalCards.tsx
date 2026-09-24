import { StaggerGroup, StaggerItem } from './Reveal';
import { VERTICALS, type VerticalFact } from '../lib/productFacts';
import { Check, ChevronRight, Coffee, Flower2, Shirt, UtensilsCrossed, type Glyph } from './glyphs';

/** Each vertical's glyph — the mark on its landing's hero and section heads. */
export const VERTICAL_GLYPH: Record<VerticalFact['id'], Glyph> = {
  clothing: Shirt,
  flowers: Flower2,
  cafe: Coffee,
  restaurant: UtensilsCrossed,
};

const TILT = ['-rotate-6', '', 'rotate-6'];

/**
 * The four businesses the POS is sold to, as cards linking to their landings.
 * Shared by the home page and /pos so the two never disagree on what a
 * vertical is called or promises.
 */
export function VerticalCards({ current }: { current?: VerticalFact['id'] }) {
  return (
    <StaggerGroup className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {VERTICALS.map((v) => {
        const active = v.id === current;
        return (
          <StaggerItem key={v.id} className="h-full">
            <a
              href={v.path}
              aria-current={active ? 'page' : undefined}
              className={`group card-link h-full overflow-hidden flex flex-col ${active ? 'ring-2 ring-pos' : ''}`}
            >
              <div className={`h-36 flex items-center justify-center ${v.tint}`}>
                {v.illustrations.map((src, i) => (
                  <img
                    key={src}
                    src={src}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    width={80}
                    height={80}
                    className={`w-20 h-20 rounded-2xl shadow-card ${i ? '-ml-3' : ''} ${TILT[i]} ${i === 1 ? 'z-10' : ''}`}
                  />
                ))}
              </div>
              <div className="p-6 flex flex-col flex-1">
                <h3 className="text-[22px] font-bold text-ink-strong">{v.title}</h3>
                <p className="text-sm text-muted mt-0.5">{v.eyebrow}</p>
                <ul className="mt-4 space-y-2 flex-1">
                  {v.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2 text-[15px] leading-snug text-body">
                      <Check size={20} className="text-pos shrink-0" />
                      {b}
                    </li>
                  ))}
                </ul>
                <p className="link-more mt-5 text-[15px]">
                  Детальніше <ChevronRight size={20} className="transition-transform group-hover:translate-x-0.5" />
                </p>
              </div>
            </a>
          </StaggerItem>
        );
      })}
    </StaggerGroup>
  );
}
