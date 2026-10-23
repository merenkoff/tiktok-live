import { Reveal, StaggerGroup, StaggerItem } from './Reveal';
import { VERTICALS, type VerticalFact } from '../lib/productFacts';
import { Check, ChevronRight, ClipboardList, Coffee, Flower2, Shirt, UtensilsCrossed, type Glyph } from './glyphs';

/** Each vertical's glyph — the mark on its landing's hero and section heads. */
export const VERTICAL_GLYPH: Record<VerticalFact['id'], Glyph> = {
  clothing: Shirt,
  flowers: Flower2,
  cafe: Coffee,
  restaurant: UtensilsCrossed,
  // The debt list rather than a basket: the vertical is built around «під запис».
  grocery: ClipboardList,
};

const TILT = ['-rotate-6', '', 'rotate-6'];

function Illustrations({ v }: { v: VerticalFact }) {
  return (
    <>
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
    </>
  );
}

/**
 * A vertical that is not sold yet: one wide card under the grid rather than a
 * fifth tile in it, with a «Скоро» pill and hollow bullets — a ✓ would say the
 * thing already works.
 */
function ComingCard({ v }: { v: VerticalFact }) {
  return (
    <Reveal className="mt-6">
      <a href={v.path} className="group card-link overflow-hidden flex flex-col sm:flex-row">
        <div className={`h-36 sm:h-auto sm:w-72 shrink-0 flex items-center justify-center ${v.tint}`}>
          <Illustrations v={v} />
        </div>
        <div className="p-6 flex flex-col flex-1">
          <div className="flex items-center gap-2.5">
            <h3 className="text-[22px] font-bold text-ink-strong">{v.title}</h3>
            <span className="text-xs font-semibold text-muted bg-side rounded-full px-2.5 py-1">Скоро</span>
          </div>
          <p className="text-sm text-muted mt-0.5">{v.eyebrow}</p>
          <ul className="mt-4 grid md:grid-cols-3 gap-x-6 gap-y-2">
            {v.bullets.map((b) => (
              <li key={b} className="flex items-start gap-2 text-[15px] leading-snug text-body">
                <span aria-hidden className="mt-[5px] w-2.5 h-2.5 rounded-full border-2 border-pos shrink-0" />
                {b}
              </li>
            ))}
          </ul>
          <p className="link-more mt-5 text-[15px]">
            Що ми будуємо <ChevronRight size={20} className="transition-transform group-hover:translate-x-0.5" />
          </p>
        </div>
      </a>
    </Reveal>
  );
}

/**
 * The businesses the POS is sold to, as cards linking to their landings, and
 * under them the ones it is being built for. Shared by the home page and /pos
 * so the two never disagree on what a vertical is called or promises.
 */
export function VerticalCards({ current }: { current?: VerticalFact['id'] }) {
  const available = VERTICALS.filter((v) => v.status === 'available');
  const coming = VERTICALS.filter((v) => v.status === 'coming' && v.id !== current);
  return (
    <>
      <StaggerGroup className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {available.map((v) => {
          const active = v.id === current;
          return (
            <StaggerItem key={v.id} className="h-full">
              <a
                href={v.path}
                aria-current={active ? 'page' : undefined}
                className={`group card-link h-full overflow-hidden flex flex-col ${active ? 'ring-2 ring-pos' : ''}`}
              >
                <div className={`h-36 flex items-center justify-center ${v.tint}`}>
                  <Illustrations v={v} />
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
      {coming.map((v) => (
        <ComingCard key={v.id} v={v} />
      ))}
    </>
  );
}
