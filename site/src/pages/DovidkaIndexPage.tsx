import { Nav } from '../components/Nav';
import { Footer } from '../components/Footer';
import { CTAForm } from '../components/CTAForm';
import { ARTICLES } from '../content/dovidka';

export function DovidkaIndexPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Nav variant="dovidka" />

      <main className="flex-1">
        <section className="max-w-3xl mx-auto px-6 pt-16 pb-12">
          <p className="text-sm font-semibold uppercase tracking-wide text-pos">Довідка</p>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mt-3">
            Каса, ПРРО і TikTok LIVE — без води
          </h1>
          <p className="text-muted text-lg mt-5 leading-relaxed">
            Відповіді на питання, які виникають у власників магазинів одягу до і після
            підключення каси: фіскалізація, офлайн-режим, зміни, продажі в ефірі. Коротка
            відповідь на початку, деталі — далі.
          </p>
        </section>

        <section className="max-w-3xl mx-auto px-6 pb-20">
          <ul className="space-y-6">
            {ARTICLES.map(({ meta }) => (
              <li key={meta.slug}>
                <a
                  href={`/dovidka/${meta.slug}`}
                  className="block border border-line rounded-card p-6 bg-paper transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg hover:border-pos/30"
                >
                  <h2 className="text-xl font-bold tracking-tight">{meta.title}</h2>
                  <p className="text-muted text-sm mt-3 leading-relaxed">{meta.description}</p>
                  <p className="text-xs text-muted mt-4">
                    <time dateTime={meta.updatedAt}>{meta.updatedAt}</time>
                    <span aria-hidden> · </span>
                    {meta.readingMinutes} хв читання
                  </p>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="max-w-3xl mx-auto px-6 pb-24">
          <CTAForm
            accent="pos"
            heading="Не знайшли відповіді?"
            subheading="Залиште телефон — відповімо і, якщо питання часте, додамо в довідку."
            buttonLabel="Запитати"
            showNameField
          />
        </section>
      </main>

      <Footer />
    </div>
  );
}
