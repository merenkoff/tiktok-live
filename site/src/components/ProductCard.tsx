interface Props {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  accentClass: string; // 'text-live' | 'text-pos'
  bgAccentClass: string; // 'bg-live/5' | 'bg-pos/5'
  ringAccentClass: string; // 'hover:border-live/40' | 'hover:border-pos/40'
  screenshot: string;
  screenshotAlt: string;
  cta: string;
}

export function ProductCard({
  href,
  eyebrow,
  title,
  body,
  accentClass,
  bgAccentClass,
  ringAccentClass,
  screenshot,
  screenshotAlt,
  cta,
}: Props) {
  return (
    <a
      href={href}
      className={`group block rounded-card border border-line p-8 transition-colors ${bgAccentClass} ${ringAccentClass}`}
    >
      <p className={`text-sm font-semibold uppercase tracking-wide ${accentClass}`}>{eyebrow}</p>
      <h3 className="text-2xl font-extrabold tracking-tight mt-2">{title}</h3>
      <p className="text-muted mt-3 leading-relaxed">{body}</p>
      <div className="mt-6 rounded-[10px] overflow-hidden border border-line shadow-sm h-56 bg-mist">
        <img src={screenshot} alt={screenshotAlt} className="w-full h-full object-cover object-top" loading="lazy" />
      </div>
      <p className={`mt-6 text-sm font-semibold ${accentClass} flex items-center gap-1.5`}>
        {cta}
        <span className="transition-transform group-hover:translate-x-1">→</span>
      </p>
    </a>
  );
}
