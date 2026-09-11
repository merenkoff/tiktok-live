import { CSSProperties, ReactNode, useEffect, useRef, useState } from 'react';

interface Props {
  children: ReactNode;
  rotate?: number;
  className?: string;
  style?: CSSProperties;
  delay?: number;
}

/** A small white card that floats over a bolder background — real UI fragments
 * presented as a collage element instead of one flat screenshot rectangle.
 * Animation is CSS-only (index.css `.floating`) so the prerendered HTML is
 * visible without JS. */
export function FloatingCard({ children, rotate = 0, className = '', style, delay = 0 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '-40px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const vars = {
    ...style,
    '--fc-rotate': `${rotate}deg`,
    '--fc-rotate-from': `${rotate - 4}deg`,
    transitionDelay: `${delay}s`,
  } as CSSProperties;

  return (
    <div
      ref={ref}
      className={`floating ${inView ? 'floating-in' : ''} bg-paper rounded-2xl shadow-2xl overflow-hidden ${className}`}
      style={vars}
    >
      {children}
    </div>
  );
}
