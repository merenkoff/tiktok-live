import { Reveal } from './Reveal';
import { Check, X } from './glyphs';

interface Column {
  title: string;
  points: string[];
  tone?: 'muted' | 'accent';
}

export function TwoColumnCompare({
  left,
  right,
  accentClass,
}: {
  left: Column;
  right: Column;
  accentClass: string;
}) {
  return (
    <Reveal>
      <div className="grid sm:grid-cols-2 gap-6">
        <div className="rounded-card ring-1 ring-inset ring-line p-6">
          <h4 className="font-bold text-lg text-ink">{left.title}</h4>
          <ul className="mt-4 space-y-2.5 text-[15px] text-muted">
            {left.points.map((p) => (
              <li key={p} className="flex items-start gap-2">
                <X size={20} className="shrink-0 text-faint" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-6">
          <h4 className={`font-bold text-lg ${accentClass}`}>{right.title}</h4>
          <ul className="mt-4 space-y-2.5 text-[15px] text-body">
            {right.points.map((p) => (
              <li key={p} className="flex items-start gap-2">
                <Check size={20} className={`shrink-0 ${accentClass}`} />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Reveal>
  );
}
