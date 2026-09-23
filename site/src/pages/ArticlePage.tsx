import { Nav } from '../components/Nav';
import { Footer } from '../components/Footer';
import { CTAForm } from '../components/CTAForm';
import { Faq } from '../components/Faq';
import { useScrollToHash } from '../hooks/useScrollToHash';
import { ARTICLES } from '../content/dovidka';
import type { Article, Heading } from '../content/dovidka/types';

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
            <p className="text-sm font-semibold uppercase tracking-wide text-pos">{meta.eyebrow}</p>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mt-3 leading-[1.08]">
              {meta.title}
            </h1>
            <p className="text-muted text-sm mt-5">
              <time dateTime={meta.updatedAt}>Оновлено {formatDate(meta.updatedAt)}</time>
              <span aria-hidden> · </span>
              {meta.readingMinutes} хв читання
            </p>
          </header>

          {meta.kind === 'guide' && <GuideSwitcher current={meta.slug} />}
          {meta.headings && meta.headings.length > 3 && <Toc headings={meta.headings} />}

          <div className="article mt-10">
            <Body />
          </div>

          <section className="mt-16">
            <h2 className="text-2xl sm:text-3xl font-bold mb-8">Питання, які запитують найчастіше</h2>
            <Faq items={meta.faq} />
          </section>
        </article>

        <section className="max-w-3xl mx-auto px-6 pb-24">
          {meta.kind === 'guide' ? (
            <CTAForm
              id="cta"
              accent="pos"
              heading="Хочете спробувати все це на демо-магазині?"
              subheading="Залиште ім'я і телефон — відкриємо вам демо-касу і допоможемо з першим запуском."
              buttonLabel="Отримати демо"
              showNameField
            />
          ) : (
            <CTAForm
              id="cta"
              accent="pos"
              heading="Хочете касу, яка не залежить від одного комп'ютера?"
              subheading="Залиште ім'я і телефон — покажемо, як працює фіскалізація і передача каси."
              buttonLabel="Замовити демо"
              showNameField
            />
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}

/** Replaces the «Посібники: … · …» line the Markdown files carry. */
function GuideSwitcher({ current }: { current: string }) {
  const guides = ARTICLES.filter((a) => a.meta.kind === 'guide');
  return (
    <nav aria-label="Посібники" className="mt-8 flex flex-wrap gap-2">
      {guides.map(({ meta }) =>
        meta.slug === current ? (
          <span key={meta.slug} aria-current="page" className="rounded-full bg-pos text-white text-sm font-semibold px-4 py-1.5">
            {meta.shortTitle ?? meta.title}
          </span>
        ) : (
          <a
            key={meta.slug}
            href={`/dovidka/${meta.slug}`}
            className="rounded-full border border-line text-sm font-semibold px-4 py-1.5 text-ink hover:border-pos/40 hover:text-pos transition-colors"
          >
            {meta.shortTitle ?? meta.title}
          </a>
        )
      )}
    </nav>
  );
}


function Toc({ headings }: { headings: Heading[] }) {
  return (
    <nav aria-label="Зміст" className="mt-8 border border-line rounded-card bg-mist p-5 text-sm">
      <p className="font-semibold text-ink mb-3">Зміст</p>
      <ol className="space-y-1.5">
        {headings.map((h) => (
          <li key={h.id} className={h.level === 3 ? 'pl-4' : 'font-semibold'}>
            <a href={`#${h.id}`} className="text-ink/80 hover:text-pos transition-colors">
              {h.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
