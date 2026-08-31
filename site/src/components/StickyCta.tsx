import { RefObject, useEffect, useState } from 'react';

type Accent = 'live' | 'pos';

const BUTTON_CLASS: Record<Accent, string> = {
  live: 'bg-live hover:bg-live-press',
  pos: 'bg-pos hover:bg-pos-press',
};

/** Appears once `heroRef`'s element has scrolled out of view. */
export function StickyCta({
  accent,
  label,
  href,
  heroRef,
}: {
  accent: Accent;
  label: string;
  href: string;
  heroRef: RefObject<HTMLElement>;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), { threshold: 0 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [heroRef]);

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 pb-4">
        <a
          href={href}
          className={`flex items-center justify-center gap-2 text-white text-sm font-semibold py-3.5 rounded-full shadow-2xl transition-colors ${BUTTON_CLASS[accent]}`}
        >
          {label}
        </a>
      </div>
    </div>
  );
}
