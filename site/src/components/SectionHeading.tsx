export function SectionHeading({
  eyebrow,
  title,
  lede,
  align = 'left',
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  align?: 'left' | 'center';
}) {
  return (
    <div className={align === 'center' ? 'text-center max-w-2xl mx-auto' : 'max-w-2xl'}>
      {eyebrow && <p className="text-sm font-semibold uppercase tracking-wide text-muted mb-3">{eyebrow}</p>}
      <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">{title}</h2>
      {lede && <p className="text-muted mt-4 text-lg leading-relaxed">{lede}</p>}
    </div>
  );
}
