type Gtag = (command: 'event', name: string, params?: Record<string, unknown>) => void;

/** GA4 event, no-op during prerender and when gtag.js is blocked. */
export function track(name: string, params?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  if (typeof gtag === 'function') gtag('event', name, params);
}
