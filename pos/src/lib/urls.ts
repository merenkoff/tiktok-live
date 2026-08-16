/** Public API origin for cross-domain POS deploy (no trailing slash). Empty = same origin. */
export function apiOrigin(): string {
  const raw = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
  return raw.replace(/\/$/, '');
}

export function posApiBase(): string {
  const origin = apiOrigin();
  return origin ? `${origin}/api/pos` : '/api/pos';
}

/** Resolve /pos-uploads/... against API host when POS is on another domain. */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^(https?:|blob:|data:)/i.test(path)) return path;
  const origin = apiOrigin();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return origin ? `${origin}${normalized}` : normalized;
}
