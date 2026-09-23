import { Nav } from '../components/Nav';
import { Footer } from '../components/Footer';
import { CTAForm } from '../components/CTAForm';
import { ARTICLES } from '../content/dovidka';

const guides = ARTICLES.filter((a) => a.meta.kind === 'guide');
const articles = ARTICLES.filter((a) => a.meta.kind === 'article');

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
            Посібники для власника, касира, ресторану й квіткового магазину — і відповіді на питання,
            які виникають до і після підключення каси: фіскалізація, офлайн-режим, зміни, продажі в
            ефірі. Коротка відповідь на початку, деталі — далі.
          </p>
        </section>

        <section className="max-w-3xl mx-auto px-6 pb-14" aria-labelledby="guides">
          <h2 id="guides" className="text-2xl sm:text-3xl font-bold tracking-tight">Посібники</h2>
          <p className="text-muted mt-3 leading-relaxed">
            Покроково, для людей, які працюють із касою щодня. Почніть із посібника власника, касирам
            дайте посібник касира, а далі — той, що про ваш тип закладу.
          </p>
          <ul className="grid sm:grid-cols-2 gap-4 mt-8">
            {guides.map(({ meta }) => (
              <li key={meta.slug}>
                <a
                  href={`/dovidka/${meta.slug}`}
                  className="flex h-full flex-col border border-line rounded-card p-6 bg-paper transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg hover:border-pos/30"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-pos">{meta.shortTitle}</p>
                  <h3 className="text-lg font-bold tracking-tight mt-2">{meta.title}</h3>
                  <p className="text-muted text-sm mt-3 leading-relaxed flex-1">{meta.description}</p>
                  <p className="text-xs text-muted mt-4">{meta.readingMinutes} хв читання</p>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="max-w-3xl mx-auto px-6 pb-20" aria-labelledby="articles">
          <h2 id="articles" className="text-2xl sm:text-3xl font-bold tracking-tight">Статті</h2>
          <ul className="space-y-6 mt-8">
            {articles.map(({ meta }) => (
              <li key={meta.slug}>
                <a
                  href={`/dovidka/${meta.slug}`}
                  className="block border border-line rounded-card p-6 bg-paper transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg hover:border-pos/30"
                >
                  <h3 className="text-xl font-bold tracking-tight">{meta.title}</h3>
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
