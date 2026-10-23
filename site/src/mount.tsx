import { ReactNode, StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { startJourney } from './lib/journey';

/** Hydrates prerendered markup in production; the dev server has none, so it renders from scratch. */
export function mount(page: ReactNode) {
  // The visitor's path to a lead form, kept in their own browser and sent only
  // with a form (TechDocs/CRM_LEADS.md). `mount` never runs in prerender.
  startJourney();
  const root = document.getElementById('root')!;
  const tree = <StrictMode>{page}</StrictMode>;
  if (root.hasChildNodes()) {
    hydrateRoot(root, tree);
  } else {
    createRoot(root).render(tree);
  }
}
