/** Large flat decorative circle — the brand mark blown up, bleeding off a hero edge. */
export function DecorCircle({ className = '', colorClass = 'bg-live' }: { className?: string; colorClass?: string }) {
  return <div aria-hidden className={`rounded-full ${colorClass} ${className}`} />;
}
