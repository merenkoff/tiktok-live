import { Nav } from '../components/Nav';
import { Footer } from '../components/Footer';
import { CTAForm } from '../components/CTAForm';
import { Faq } from '../components/Faq';
import { useScrollToHash } from '../hooks/useScrollToHash';
import type { Article } from '../content/dovidka/types';

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const months = [
    'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
    'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня',
  ];
  return `${d} ${months[m - 1]} ${y}`;
}

export function ArticlePage({ article }: { article: Article }) {
  const { meta, Body } = article;
  useScrollToHash();

  return (
    <div className="min-h-screen flex flex-col">
      <Nav variant="dovidka" />

      <main className="flex-1">
        <article className="max-w-3xl mx-auto px-6 pt-12 pb-20">
          <nav aria-label="Хлібні крихти" className="text-sm text-muted flex flex-wrap gap-2">
            <a href="/" className="hover:text-ink transition-colors">Головна</a>
            <span aria-hidden>/</span>
            <a href="/dovidka" className="hover:text-ink transition-colors">Довідка</a>
          </nav>

          <header className="mt-6">
            <p className="text-sm font-semibold uppercase tracking-wide text-pos">ПРРО і фіскалізація</p>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mt-3 leading-[1.08]">
              {meta.title}
            </h1>
            <p className="text-muted text-sm mt-5">
              <time dateTime={meta.updatedAt}>Оновлено {formatDate(meta.updatedAt)}</time>
              <span aria-hidden> · </span>
              {meta.readingMinutes} хв читання
            </p>
          </header>

          <div className="article mt-10">
            <Body />
          </div>

          <section className="mt-16">
            <h2 className="text-2xl sm:text-3xl font-bold mb-8">Питання, які запитують найчастіше</h2>
            <Faq items={meta.faq} />
          </section>
        </article>

        <section className="max-w-3xl mx-auto px-6 pb-24">
          <CTAForm
            id="cta"
            accent="pos"
            heading="Хочете касу, яка не залежить від одного комп'ютера?"
            subheading="Залиште ім'я і телефон — покажемо, як працює фіскалізація і передача каси."
            buttonLabel="Замовити демо"
            showNameField
          />
        </section>
      </main>

      <Footer />
    </div>
  );
}
