import { StaggerGroup, StaggerItem } from './Reveal';
import { VERTICALS, type VerticalFact } from '../lib/productFacts';

/**
 * The four businesses the POS is sold to, as cards linking to their landings.
 * Shared by the home page and /pos so the two never disagree on what a
 * vertical is called or promises.
 */
export function VerticalCards({ current }: { current?: VerticalFact['id'] }) {
  return (
    <StaggerGroup className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {VERTICALS.map((v) => {
        const active = v.id === current;
        return (
          <StaggerItem key={v.id}>
            <a
              href={v.path}
              aria-current={active ? 'page' : undefined}
              className={`group block h-full rounded-2xl border p-6 transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-lg ${v.tint} ${
                active ? 'border-pos' : 'border-transparent hover:border-pos/30'
              }`}
            >
              <div className="flex items-end gap-1 h-16">
                {v.illustrations.map((src, i) => (
                  <img
                    key={src}
                    src={src}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    width={64}
                    height={64}
                    className={`rounded-xl shadow-sm ${i === 1 ? 'w-16 h-16 -mx-1 z-10' : 'w-12 h-12 opacity-90'}`}
                  />
                ))}
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted mt-5">{v.eyebrow}</p>
              <h3 className="text-xl font-extrabold tracking-tight mt-1">{v.title}</h3>
              <ul className="mt-3 space-y-1.5">
                {v.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-sm text-ink/85">
                    <span className="mt-2 w-1.5 h-1.5 rounded-full bg-pos shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm font-semibold text-pos flex items-center gap-1.5">
                Детальніше <span className="transition-transform group-hover:translate-x-0.5">→</span>
              </p>
            </a>
          </StaggerItem>
        );
      })}
    </StaggerGroup>
  );
}
