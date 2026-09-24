import type { ReactNode } from 'react';

/**
 * A section head the way Things draws one: a coloured glyph (48 px, twice its
 * grid) over a big centred heading and a lede. Left-aligned for the two-column
 * sections.
 */
export function SectionHeading({
  icon,
  eyebrow,
  eyebrowClass = 'text-pos',
  title,
  lede,
  align = 'center',
  className = '',
}: {
  icon?: ReactNode;
  eyebrow?: string;
  eyebrowClass?: string;
  title: ReactNode;
  lede?: ReactNode;
  align?: 'left' | 'center';
  className?: string;
}) {
  const center = align === 'center';
  return (
    <div className={`${center ? 'text-center mx-auto flex flex-col items-center max-w-2xl' : 'max-w-2xl'} ${className}`}>
      {icon && <div className="mb-4">{icon}</div>}
      {eyebrow && <p className={`eyebrow ${eyebrowClass} mb-2`}>{eyebrow}</p>}
      <h2 className="h-section">{title}</h2>
      {lede && <p className="lede mt-4">{lede}</p>}
    </div>
  );
}
