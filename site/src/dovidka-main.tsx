import { mount } from './mount';
import { ArticlePage } from './pages/ArticlePage';
import { DovidkaIndexPage } from './pages/DovidkaIndexPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AboutPage } from './pages/AboutPage';
import { findArticle } from './content/dovidka';
import './index.css';

// One entry serves /dovidka, every /dovidka/<slug>, /about and 404.html, so the page
// is picked from the URL — and must match what the prerender put in the HTML.
function pick() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/dovidka') return <DovidkaIndexPage />;
  if (path === '/about') return <AboutPage />;
  if (path.startsWith('/dovidka/')) {
    const article = findArticle(path.slice('/dovidka/'.length));
    if (article) return <ArticlePage article={article} />;
  }
  return <NotFoundPage />;
}

mount(pick());
