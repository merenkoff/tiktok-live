import { ReactNode, StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';

/** Hydrates prerendered markup in production; the dev server has none, so it renders from scratch. */
export function mount(page: ReactNode) {
  const root = document.getElementById('root')!;
  const tree = <StrictMode>{page}</StrictMode>;
  if (root.hasChildNodes()) {
    hydrateRoot(root, tree);
  } else {
    createRoot(root).render(tree);
  }
}
