import { Reveal, StaggerGroup, StaggerItem } from './Reveal';
import { SectionHeading } from './SectionHeading';
import { Sparkles } from './glyphs';
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
        <SectionHeading icon={<Sparkles size={48} />} eyebrow="Скоро" title={title} lede={lede} />
      </Reveal>
      <StaggerGroup className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((f) => (
          <StaggerItem key={f.id} className="h-full">
            <div className="card p-6 h-full flex flex-col">
              <div className="flex items-center justify-between">
                <Sparkles size={24} />
                <span className="text-xs font-semibold text-muted bg-side rounded-full px-2.5 py-1">у планах</span>
              </div>
              <h3 className="font-bold text-ink-strong mt-4">{f.title}</h3>
              <p className="text-muted text-[15px] mt-2 leading-relaxed flex-1">{f.body}</p>
              <div className="mt-5">
                <div className="flex items-center justify-between text-[13px] font-semibold text-muted">
                  <span>Готовність</span>
                  <span className="tabular-nums text-pos">{f.progress} %</span>
                </div>
                <div
                  className="mt-1.5 h-1.5 rounded-full bg-side overflow-hidden"
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
