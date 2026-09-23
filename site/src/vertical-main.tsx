import { mount } from './mount';
import { VerticalPage } from './pages/VerticalPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { findVerticalPage } from './content/verticals';
import './index.css';

// One entry serves every /pos/<slug> landing, so the page is picked from the
// URL — and must match what the prerender put in the HTML.
function pick() {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path.startsWith('/pos/')) {
    const page = findVerticalPage(path.slice('/pos/'.length));
    if (page) return <VerticalPage page={page} />;
  }
  return <NotFoundPage />;
}

mount(pick());
