import { Reveal } from './Reveal';

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
        <div className="rounded-card border border-line p-6 bg-mist">
          <h4 className="font-bold text-lg">{left.title}</h4>
          <ul className="mt-4 space-y-2.5 text-sm text-muted">
            {left.points.map((p) => (
              <li key={p} className="flex items-start gap-2.5">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-muted shrink-0" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-card border border-line p-6 bg-paper shadow-sm">
          <h4 className={`font-bold text-lg ${accentClass}`}>{right.title}</h4>
          <ul className="mt-4 space-y-2.5 text-sm text-ink/90">
            {right.points.map((p) => (
              <li key={p} className="flex items-start gap-2.5">
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${accentClass.replace('text-', 'bg-')}`} />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Reveal>
  );
}
