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
          <p className="eyebrow text-pos">Довідка</p>
          <h1 className="h-display mt-3">
            Каса, ПРРО і TikTok LIVE — без води
          </h1>
          <p className="lede mt-5">
            Посібники для власника, касира, ресторану й квіткового магазину — і відповіді на питання,
            які виникають до і після підключення каси: фіскалізація, офлайн-режим, зміни, продажі в
            ефірі. Коротка відповідь на початку, деталі — далі.
          </p>
        </section>

        <section className="max-w-3xl mx-auto px-6 pb-14" aria-labelledby="guides">
          <h2 id="guides" className="h-section tracking-tight">Посібники</h2>
          <p className="text-muted mt-3 leading-relaxed">
            Покроково, для людей, які працюють із касою щодня. Почніть із посібника власника, касирам
            дайте посібник касира, а далі — той, що про ваш тип закладу.
          </p>
          <ul className="grid sm:grid-cols-2 gap-4 mt-8">
            {guides.map(({ meta }) => (
              <li key={meta.slug}>
                <a
                  href={`/dovidka/${meta.slug}`}
                  className="flex h-full flex-col card-link p-6"
                >
                  <p className="text-[13px] font-semibold text-pos">{meta.shortTitle}</p>
                  <h3 className="text-lg font-bold text-ink-strong mt-2">{meta.title}</h3>
                  <p className="text-muted text-[15px] mt-3 leading-relaxed flex-1">{meta.description}</p>
                  <p className="text-xs text-muted mt-4">{meta.readingMinutes} хв читання</p>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="max-w-3xl mx-auto px-6 pb-20" aria-labelledby="articles">
          <h2 id="articles" className="h-section tracking-tight">Статті</h2>
          <ul className="space-y-6 mt-8">
            {articles.map(({ meta }) => (
              <li key={meta.slug}>
                <a
                  href={`/dovidka/${meta.slug}`}
                  className="block card-link p-6"
                >
                  <h3 className="text-xl font-bold text-ink-strong">{meta.title}</h3>
                  <p className="text-muted text-[15px] mt-3 leading-relaxed">{meta.description}</p>
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
