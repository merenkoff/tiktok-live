import { useEffect } from 'react';

// The browser tries to scroll to `location.hash` before this SPA has
// mounted (the target doesn't exist in the DOM yet on a fresh load), and
// doesn't retry once React renders it — so links like /pos#cta land at
// the top of the page instead. Do the scroll ourselves once mounted, and
// retry a couple of times shortly after: web-font swap and below-the-fold
// lazy images still loading at mount time shift page layout and can leave
// an immediate scrollIntoView() short of the target.
export function useScrollToHash() {
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;

    const scroll = () => {
      document.getElementById(hash)?.scrollIntoView();
    };

    scroll();
    const retries = [150, 500].map((ms) => setTimeout(scroll, ms));
    return () => retries.forEach(clearTimeout);
  }, []);
}
