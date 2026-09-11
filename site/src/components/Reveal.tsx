import { Children, cloneElement, isValidElement, ReactNode, useEffect, useRef, useState } from 'react';

// Scroll-reveal without framer-motion: the prerendered HTML carries the content
// fully visible, and only `html.js` (set by an inline script before first
// paint) hides it until it scrolls into view — see index.css. Crawlers and
// no-JS readers never see `opacity: 0`.

function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
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

  return { ref, inView };
}

/** Fades content up into place the first time it scrolls into view. */
export function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`reveal ${inView ? 'reveal-in' : ''} ${className}`}
      style={delay ? { transitionDelay: `${delay}s` } : undefined}
    >
      {children}
    </div>
  );
}

/** Reveals children one after another with a staggered delay — for grids. */
export function StaggerGroup({
  children,
  className = '',
  stagger = 0.08,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={`${inView ? 'reveal-in' : ''} ${className}`}>
      {Children.map(children, (child, i) =>
        isValidElement<{ delay?: number }>(child) ? cloneElement(child, { delay: i * stagger }) : child
      )}
    </div>
  );
}

export function StaggerItem({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <div className={`reveal reveal-child ${className}`} style={{ transitionDelay: `${delay}s` }}>
      {children}
    </div>
  );
}
