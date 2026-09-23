import { Reveal, StaggerGroup, StaggerItem } from './Reveal';
import { Sparkles } from 'lucide-react';
import type { RoadmapItem } from '../lib/productFacts';

/**
 * «Скоро» — what is promised next, the way /live shows its plans: a feature
 * card with a «у планах» badge, plus how far along it is. Promises, not
 * descriptions of existing code (see TechDocs/SITE_PROMISES.md).
 */
export function Roadmap({
  items,
  title = 'Що ми робимо далі — і що входить у ваш тариф',
  lede,
}: {
  items: readonly RoadmapItem[];
  title?: string;
  lede?: string;
}) {
  if (!items.length) return null;
  return (
    <section className="max-w-6xl mx-auto px-6 py-20">
      <Reveal>
        <p className="text-sm font-semibold uppercase tracking-wide text-pos text-center">Скоро</p>
        <h2 className="text-2xl sm:text-3xl font-bold text-center max-w-xl mx-auto mt-3">{title}</h2>
        {lede && <p className="text-muted text-center mt-3 max-w-xl mx-auto">{lede}</p>}
      </Reveal>
      <StaggerGroup className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((f) => (
          <StaggerItem key={f.id}>
            <div className="border border-dashed border-line rounded-card p-6 h-full bg-paper flex flex-col">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-full bg-pos/5 grid place-items-center">
                  <Sparkles className="w-5 h-5 text-pos" strokeWidth={1.75} />
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted border border-line rounded-full px-2.5 py-1">
                  у планах
                </span>
              </div>
              <h3 className="font-bold mt-4">{f.title}</h3>
              <p className="text-muted text-sm mt-2.5 leading-relaxed flex-1">{f.body}</p>
              <div className="mt-5">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <span>Готовність</span>
                  <span className="font-mono text-pos">{f.progress} %</span>
                </div>
                <div
                  className="mt-1.5 h-1.5 rounded-full bg-mist overflow-hidden"
                  role="progressbar"
                  aria-valuenow={f.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${f.title}: готовність ${f.progress} %`}
                >
                  <div className="h-full rounded-full bg-pos" style={{ width: `${f.progress}%` }} />
                </div>
              </div>
            </div>
          </StaggerItem>
        ))}
      </StaggerGroup>
    </section>
  );
}
