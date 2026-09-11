import { mount } from './mount';
import { ArticlePage } from './pages/ArticlePage';
import { DovidkaIndexPage } from './pages/DovidkaIndexPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { findArticle } from './content/dovidka';
import './index.css';

// One entry serves /dovidka, every /dovidka/<slug> and 404.html, so the page
// is picked from the URL — and must match what the prerender put in the HTML.
function pick() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/dovidka') return <DovidkaIndexPage />;
  if (path.startsWith('/dovidka/')) {
    const article = findArticle(path.slice('/dovidka/'.length));
    if (article) return <ArticlePage article={article} />;
  }
  return <NotFoundPage />;
}

mount(pick());
