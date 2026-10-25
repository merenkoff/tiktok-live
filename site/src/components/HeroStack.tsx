import { useEffect, useRef, useState } from 'react';
import { BrowserFrame } from './BrowserFrame';
import type { Shot } from '../content/verticals/types';

/**
 * Two pictures, one lying on the other: a drawing — the grocery landing's debt
 * notebook, what the till replaces — and the screen that lands on it and stays.
 * The drawing is the larger one and lies askew, like paper on a counter; the
 * screen lies straight over its lower right, on the sums and the «Разом — ?»
 * nobody wrote, so the title, the names, the struck-out line and the sticky
 * note stay in view. Below `sm` the screen hangs under the drawing and covers
 * only its last line, which keeps the names readable on a phone.
 *
 * At rest this is the whole picture: prerendered HTML, crawlers, no JS and
 * reduced motion all get both in place. With `html.js` the screen waits,
 * hidden, for the reveal and for its own pixels (`data-ready` — a slow
 * connection must not see an empty window fly in), then flies in and the
 * drawing gives a little under it (index.css).
 */
export function HeroStack({ base, overlay }: { base: Shot; overlay: Shot }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const waiting = Array.from(ref.current?.querySelectorAll('img') ?? []).filter((img) => !img.complete);
    if (waiting.length === 0) {
      setReady(true);
      return;
    }
    let left = waiting.length;
    // A broken image counts as arrived: the screen then lands with its alt text rather than never.
    const arrived = () => {
      left -= 1;
      if (left === 0) setReady(true);
    };
    for (const img of waiting) {
      img.addEventListener('load', arrived, { once: true });
      img.addEventListener('error', arrived, { once: true });
    }
    return () => {
      for (const img of waiting) {
        img.removeEventListener('load', arrived);
        img.removeEventListener('error', arrived);
      }
    };
  }, []);

  return (
    <div ref={ref} className="hero-stack" data-ready={ready ? '' : undefined}>
      <img
        src={base.src}
        alt={base.alt}
        width={1200}
        height={760}
        className="hero-stack-base block w-[92%] sm:w-[80%] h-auto rounded-card shadow-ambient"
      />
      {/* A negative margin in % is a share of the width, as the drawing's height is:
          the screen's top edge lands at 82% of the drawing's height on a phone, 40% from sm. */}
      <div className="hero-stack-fly relative z-10 ml-auto w-[78%] sm:w-[58%] -mt-[10.5%] sm:-mt-[30.4%]">
        <BrowserFrame src={overlay.src} alt={overlay.alt} width={1366} height={768} elevated />
      </div>
    </div>
  );
}
