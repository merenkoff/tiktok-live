import { useRef } from 'react';
import { Nav } from '../components/Nav';
import { Footer } from '../components/Footer';
import { CTAForm } from '../components/CTAForm';
import { Faq } from '../components/Faq';
import { BrowserFrame } from '../components/BrowserFrame';
import { PhoneFrame } from '../components/PhoneFrame';
import { FeatureRow } from '../components/FeatureRow';
import { Reveal, StaggerGroup, StaggerItem } from '../components/Reveal';
import { SectionHeading } from '../components/SectionHeading';
import { StickyCta } from '../components/StickyCta';
import { VerticalCards, VERTICAL_GLYPH } from '../components/VerticalCards';
import { PricingCard } from '../components/PricingSection';
import { Readiness, Roadmap } from '../components/Roadmap';
import { useScrollToHash } from '../hooks/useScrollToHash';
import { PRICING, roadmapFor } from '../lib/productFacts';
import type { VerticalPageData, VerticalRow } from '../content/verticals';
import {
  BarChart3,
  Check,
  ChevronRight,
  ClipboardCheck,
  MessageCircle,
  Package,
  QrCode,
  ShieldCheck,
  Users,
  WifiOff,
} from '../components/glyphs';
import { CTA } from '../lib/ctaIds';
import type { LeadProduct } from '../hooks/useLeadSubmit';

/** The core every vertical shares; short on purpose — /pos tells the long version. */
const CORE = [
  { icon: ShieldCheck, t: 'ПРРО через Checkbox', d: 'Зміни, Z-звіт, фіскальний чек із QR — онлайн і офлайн.', href: '/pos#prro' },
  { icon: WifiOff, t: 'Каса без інтернету', d: 'Десктопна каса продає з локальної копії й синхронізується потім.', href: '/pos#download' },
  { icon: Package, t: 'Склад документами', d: 'Прихід, списання, інвентаризація — з проведенням і сторно.', href: '/pos' },
  { icon: QrCode, t: 'QR-оплата', d: 'Динамічний QR, оплата підтверджується сама.', href: '/pos' },
  { icon: Users, t: 'Власник і продавець', d: 'Кабінет по email, каса за PIN — ролі розділені.', href: '/pos' },
  { icon: BarChart3, t: 'Аналітика', d: 'Продажі по днях, середній чек, топ товарів — у кабінеті.', href: '/pos' },
];

/**
 * A row of a «Скоро» landing that is a promise: no ✓ (a tick says it works),
 * hollow bullets, its readiness from ROADMAP. The first one is the vertical's
 * headline feature and gets the full width — when that leaves the rest in
 * pairs; an even number of promises (say, two, once the headline itself
 * works) sit side by side instead of leaving half a row empty.
 */
function PromiseCard({ row, progress, wide }: { row: VerticalRow; progress: number; wide: boolean }) {
  return (
    <Reveal className={wide ? 'lg:col-span-2' : ''}>
      <article className={`card h-full p-6 sm:p-8 ${wide ? 'lg:grid lg:grid-cols-2 lg:gap-12' : 'flex flex-col'}`}>
        <div>
          <div className="flex items-center gap-2.5">
            <p className="eyebrow text-pos">{row.eyebrow}</p>
            <span className="text-xs font-semibold text-muted bg-side rounded-full px-2.5 py-1">Скоро</span>
          </div>
          <h3 className={`${wide ? 'text-2xl sm:text-3xl' : 'text-2xl'} font-bold tracking-[-0.015em] text-ink-strong mt-2`}>
            {row.title}
          </h3>
          <p className="text-body mt-4 leading-relaxed">{row.body}</p>
        </div>
        <div className={`mt-6 ${wide ? 'lg:mt-0' : 'flex-1 flex flex-col'}`}>
          {row.bullets && (
            <ul className={`space-y-2.5 ${wide ? '' : 'flex-1'}`}>
              {row.bullets.map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-[15px] text-body leading-snug">
                  <span aria-hidden className="mt-[5px] w-2.5 h-2.5 rounded-full border-2 border-pos shrink-0" />
                  {b}
                </li>
              ))}
            </ul>
          )}
          <Readiness title={row.title} progress={progress} className="mt-6 max-w-sm" />
        </div>
      </article>
    </Reveal>
  );
}

/**
 * The headline feature of a «Скоро» landing once it works: the same wide card
 * as the first promise, but with ✓ and «Уже працює» where the promise has
 * hollow bullets, «Скоро» and a readiness bar.
 */
function HeadlineCard({ row }: { row: VerticalRow }) {
  return (
    <Reveal>
      <article className="card p-6 sm:p-8 lg:grid lg:grid-cols-2 lg:gap-12">
        <div>
          <div className="flex items-center gap-2.5">
            <p className="eyebrow text-pos">{row.eyebrow}</p>
            <span className="text-xs font-semibold text-pos bg-side rounded-full px-2.5 py-1">Уже працює</span>
          </div>
          <h3 className="text-2xl sm:text-3xl font-bold tracking-[-0.015em] text-ink-strong mt-2">{row.title}</h3>
          <p className="text-body mt-4 leading-relaxed">{row.body}</p>
          {row.link && (
            <a href={row.link.href} className="link-more text-[17px] mt-6">
              {row.link.label} <ChevronRight size={20} />
            </a>
          )}
        </div>
        {row.bullets && (
          <ul className="mt-6 lg:mt-0 space-y-2.5">
            {row.bullets.map((b) => (
              <li key={b} className="flex items-start gap-2 text-[15px] text-body leading-snug">
                <Check size={20} className="shrink-0 text-pos" />
                {b}
              </li>
            ))}
          </ul>
        )}
      </article>
    </Reveal>
  );
}

export function VerticalPage({ page }: { page: VerticalPageData }) {
  const { fact, content } = page;
  const Mark = VERTICAL_GLYPH[fact.id];
  const heroRef = useRef<HTMLElement>(null);
  useScrollToHash();

  // A «Скоро» landing (fact.status === 'coming') shows no screen, sells no
  // download and asks for a phone number instead; its promises are the rows
  // that name a ROADMAP item, and what works today is kept apart from them.
  const coming = fact.status === 'coming';
  const roadmap = roadmapFor(fact.id);
  const promises = content.rows.filter((row) => row.roadmap);
  // The headline feature that already works opens a «Скоро» page rather than
  // joining the band of what works today further down.
  const headline = coming ? content.rows.find((row) => row.headline && !row.roadmap) : undefined;
  const today = content.rows.filter((row) => !row.roadmap && row !== headline);
  const promised = new Set(promises.map((row) => row.roadmap));
  const progressOf = (id: string | undefined) => roadmap.find((item) => item.id === id)?.progress ?? 0;
  const cta = content.cta ?? {
    heading: 'Готові підключити касу?',
    subheading: "Залиште ім'я і телефон — покажемо на прикладі вашого бізнесу.",
    button: 'Замовити демо',
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Nav variant="pos" activePath={fact.path} />

      <main className="flex-1">
        {/* Hero */}
        <section ref={heroRef} className="max-w-6xl mx-auto px-6 pt-16 sm:pt-20 pb-24 text-center">
          <Reveal className="flex flex-col items-center">
            <div className={`w-24 h-24 rounded-[22px] grid place-items-center shadow-card ${fact.tint}`}>
              <Mark size={48} />
            </div>
            {coming && (
              <span className="mt-8 inline-flex items-center h-8 px-3.5 rounded-full bg-paper shadow-card text-[13px] font-semibold text-pos">
                Скоро
              </span>
            )}
            {/* No eyebrow here: every landing's H1 opens with it, so it read twice.
                The eyebrow stays in the footer, the «Інший бізнес?» cards, the breadcrumbs and the JSON-LD. */}
            <h1 className={`h-display ${coming ? 'mt-5' : 'mt-8'} max-w-4xl`}>{content.h1}</h1>
            <p className="lede mt-6 max-w-2xl">{content.lede}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
              {coming ? (
                <>
                  <a href="#cta" className="btn-pos" data-cta={CTA.heroWaitlist}>
                    Записатися в перші
                  </a>
                  <a href="#today" className="link-more text-[17px]" data-cta={CTA.heroToday}>
                    Що вже працює <ChevronRight size={20} />
                  </a>
                </>
              ) : (
                <>
                  <a href="/pos#download" className="btn-pos" data-cta={CTA.heroDownload}>
                    Завантажити POS
                  </a>
                  <a href="#cta" className="link-more text-[17px]" data-cta={CTA.heroDemo}>
                    Замовити демо <ChevronRight size={20} />
                  </a>
                </>
              )}
            </div>
            <p className="text-sm text-muted mt-5">
              {coming
                ? (content.comingNote ?? `Вертикаль у розробці. Сама каса вже є: ${PRICING.pos.label.toLowerCase()}.`)
                : `${PRICING.pos.label}.`}
            </p>
            {content.demoLink && (
              <a
                href={content.demoLink.href}
                className="link-more text-[15px] mt-3"
                rel="noopener"
                data-cta={CTA.demoMenu(fact.slug)}
              >
                {content.demoLink.label} <ChevronRight size={20} />
              </a>
            )}
          </Reveal>
          <Reveal className={`mt-14 mx-auto ${content.hero.drawing ? 'max-w-4xl' : 'max-w-5xl'}`}>
            {content.hero.drawing ? (
              <img
                src={content.hero.src}
                alt={content.hero.alt}
                width={1200}
                height={760}
                className="w-full h-auto block rounded-card shadow-ambient"
              />
            ) : (
              <BrowserFrame src={content.hero.src} alt={content.hero.alt} elevated />
            )}
          </Reveal>
        </section>

        {/* Who does what: the hero's long version, as two short lists */}
        {content.sides && (
          <section className="max-w-5xl mx-auto px-6 pb-20" aria-labelledby="sides-title">
            <Reveal>
              <h2 id="sides-title" className="h-section text-center">
                {content.sides.title}
              </h2>
            </Reveal>
            <StaggerGroup className="mt-10 grid md:grid-cols-2 gap-6">
              {content.sides.columns.map((col) => (
                <StaggerItem key={col.title} className="h-full">
                  <div className="card h-full p-6 sm:p-8">
                    <div className="flex items-center gap-4">
                      <col.icon size={48} />
                      <div>
                        <h3 className="text-xl font-bold text-ink-strong">{col.title}</h3>
                        <p className="text-muted text-[15px] mt-0.5">{col.caption}</p>
                      </div>
                    </div>
                    <ul className="mt-6 space-y-4">
                      {col.items.map((item) => (
                        <li key={item.text} className="flex gap-3">
                          <item.icon size={24} className="shrink-0 mt-px" />
                          <span className="text-body text-[16px] leading-snug">{item.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </StaggerItem>
              ))}
            </StaggerGroup>
          </section>
        )}

        {/* Answer-first summary */}
        {content.overview && (
          <section className="max-w-4xl mx-auto px-6 pb-20" aria-labelledby="overview-title">
            <Reveal>
              <div className="card p-6 sm:p-10">
                <h2 id="overview-title" className="h-section text-left">
                  {content.overview.title}
                </h2>
                <p className="text-body text-[17px] leading-relaxed mt-4">{content.overview.body}</p>
                <dl className="mt-8 grid sm:grid-cols-2 gap-x-10 gap-y-5">
                  {content.overview.facts.map((f) => (
                    <div key={f.label}>
                      <dt className="text-[13px] font-semibold text-muted">{f.label}</dt>
                      <dd className="text-[15px] text-ink mt-1 leading-relaxed">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Reveal>
          </section>
        )}

        {/* The headline feature, once it works — a «Скоро» landing is still about it */}
        {headline?.headline && (
          <section className="max-w-6xl mx-auto px-6 pb-20">
            <Reveal>
              <SectionHeading
                icon={<ClipboardCheck size={48} />}
                title={headline.headline.heading}
                lede={headline.headline.lede}
              />
            </Reveal>
            <div className="mt-12">
              <HeadlineCard row={headline} />
            </div>
          </section>
        )}

        {/* Promises — what a «Скоро» landing is about, its headline feature first unless that one already works (above) */}
        {promises.length > 0 && (
          <section className="max-w-6xl mx-auto px-6 pb-4">
            <Reveal>
              <SectionHeading
                icon={<Mark size={48} />}
                title="Що ми будуємо"
                lede="Цього в касі ще немає: над цим ми працюємо зараз, і поруч — наскільки просунулись."
              />
            </Reveal>
            <div className="mt-12 grid lg:grid-cols-2 gap-6">
              {promises.map((row, i) => (
                <PromiseCard
                  key={row.title}
                  row={row}
                  progress={progressOf(row.roadmap)}
                  wide={i === 0 && promises.length % 2 === 1}
                />
              ))}
            </div>
          </section>
        )}

        {/* The rest of the promises, as «Скоро» cards; on a landing of a working vertical they come after the price */}
        {coming && (
          <Roadmap items={roadmap.filter((item) => !promised.has(item.id))} title="Ще в планах" lede={content.roadmapLede} />
        )}

        {/* What works today. On a «Скоро» landing: cards on a band, apart from the promises */}
        {coming ? (
          today.length > 0 && (
            <section id="today" className="band scroll-mt-16">
              <div className="max-w-6xl mx-auto px-6 py-24">
                <Reveal>
                  <SectionHeading
                    icon={<ShieldCheck size={48} />}
                    title="Що вже працює сьогодні"
                    lede="Це в касі є вже зараз — для фасованого товару зі штрихкодом."
                  />
                </Reveal>
                <StaggerGroup className="mt-12 grid md:grid-cols-2 gap-6">
                  {today.map((row) => (
                    <StaggerItem key={row.title} className="h-full">
                      <div className="card-flat h-full p-6 sm:p-8 flex flex-col">
                        <p className="eyebrow text-pos">{row.eyebrow}</p>
                        <h3 className="text-2xl font-bold tracking-[-0.015em] text-ink-strong mt-2">{row.title}</h3>
                        <p className="text-body mt-4 leading-relaxed">{row.body}</p>
                        {row.bullets && (
                          <ul className="mt-5 space-y-2.5 flex-1">
                            {row.bullets.map((b) => (
                              <li key={b} className="flex items-start gap-2 text-[15px] text-body">
                                <Check size={20} className="shrink-0 text-pos" />
                                {b}
                              </li>
                            ))}
                          </ul>
                        )}
                        {row.link && (
                          <a href={row.link.href} className="link-more text-[17px] mt-6">
                            {row.link.label} <ChevronRight size={20} />
                          </a>
                        )}
                      </div>
                    </StaggerItem>
                  ))}
                </StaggerGroup>
              </div>
            </section>
          )
        ) : (
          <section className="max-w-6xl mx-auto px-6 pb-12">
            <Reveal>
              <SectionHeading icon={<Mark size={48} />} title="Як це виглядає на касі" />
            </Reveal>
            {today.map((row, i) => (
              <FeatureRow
                key={row.title}
                eyebrow={row.eyebrow}
                title={row.title}
                body={row.body}
                bullets={row.bullets}
                accentClass="text-pos"
                reverse={i % 2 === 1}
                link={row.link}
                visual={
                  row.shot ? (
                    row.shot.phone ? (
                      <PhoneFrame src={row.shot.src} alt={row.shot.alt} />
                    ) : (
                      <BrowserFrame src={row.shot.src} alt={row.shot.alt} />
                    )
                  ) : row.mockup ? (
                    <div className="max-w-md mx-auto">
                      <row.mockup />
                    </div>
                  ) : undefined
                }
              />
            ))}
          </section>
        )}

        {/* Shared core and price — a «Скоро» landing has said both in its own words above */}
        {!coming && (
          <>
            <section className="band">
              <div className="max-w-6xl mx-auto px-6 py-24">
                <Reveal>
                  <SectionHeading
                    icon={<Package size={48} />}
                    title="Спільне ядро для всіх"
                    lede="Те, що є в касі незалежно від того, що ви продаєте. Докладно — на сторінці каси."
                  />
                </Reveal>
                <StaggerGroup className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {CORE.map((c) => (
                    <StaggerItem key={c.t} className="h-full">
                      <a href={c.href} className="block h-full card-flat p-6 transition-colors hover:bg-selected">
                        <c.icon size={24} />
                        <h3 className="font-bold text-ink-strong mt-3">{c.t}</h3>
                        <p className="text-muted text-[15px] mt-1.5 leading-relaxed">{c.d}</p>
                      </a>
                    </StaggerItem>
                  ))}
                </StaggerGroup>
              </div>
            </section>

            <section className="max-w-4xl mx-auto px-6 py-20">
              <PricingCard addon={fact.id === 'restaurant'} />
            </section>

            <Roadmap items={roadmap} lede={content.roadmapLede ?? 'Усе це входить у тариф тих, хто підключився на період запуску.'} />
          </>
        )}

        {/* FAQ */}
        <section className="max-w-3xl mx-auto px-6 pb-24">
          <Reveal>
            <SectionHeading icon={<MessageCircle size={48} />} title="Питання, які запитують найчастіше" className="mb-10" />
            <Faq items={content.faq} />
            {content.guide && (
              <p className="text-muted mt-8 leading-relaxed text-center">
                Як це виглядає в роботі щодня, крок за кроком, —{' '}
                <a href={`/dovidka/${content.guide.slug}`} className="text-pos font-semibold hover:underline underline-offset-2">
                  {content.guide.label}
                </a>
                .
              </p>
            )}
          </Reveal>
        </section>

        {/* Articles that answer this business's search questions */}
        {content.articles && content.articles.length > 0 && (
          <section className="max-w-6xl mx-auto px-6 pb-24">
            <Reveal>
              <SectionHeading title="Читайте також" className="mb-10" />
            </Reveal>
            {/* One, two or four articles are centred rather than leaving a row with empty thirds. */}
            <StaggerGroup
              className={`grid gap-6 ${
                content.articles.length === 1
                  ? 'max-w-xl mx-auto'
                  : content.articles.length === 2 || content.articles.length === 4
                    ? 'md:grid-cols-2 max-w-4xl mx-auto'
                    : 'md:grid-cols-3'
              }`}
            >
              {content.articles.map((a) => (
                <StaggerItem key={a.slug} className="h-full">
                  <a href={`/dovidka/${a.slug}`} className="block h-full card-flat p-6 transition-colors hover:bg-selected">
                    <h3 className="font-bold text-ink-strong leading-snug">{a.title}</h3>
                    <p className="text-muted text-[15px] mt-2 leading-relaxed">{a.blurb}</p>
                    <span className="link-more text-[15px] mt-4">
                      Читати <ChevronRight size={20} />
                    </span>
                  </a>
                </StaggerItem>
              ))}
            </StaggerGroup>
          </section>
        )}

        {/* Other verticals */}
        <section className="max-w-6xl mx-auto px-6 pb-24">
          <Reveal>
            <SectionHeading title="Інший бізнес?" className="mb-10" />
          </Reveal>
          <VerticalCards current={fact.id} />
        </section>

        {/* Closing CTA */}
        <section className="max-w-3xl mx-auto px-6 pb-24">
          <CTAForm
            id="cta"
            formId={`vertical-${fact.slug}`}
            intent={content.cta?.intent ?? (coming ? 'waitlist' : 'demo')}
            product={fact.slug as LeadProduct}
            accent="pos"
            heading={cta.heading}
            subheading={cta.subheading}
            buttonLabel={cta.button}
            showNameField
          />
        </section>
      </main>

      {coming ? (
        <StickyCta accent="pos" label="Записатися в перші" href="#cta" cta={CTA.stickyWaitlist} heroRef={heroRef} />
      ) : (
        <StickyCta accent="pos" label="Завантажити POS" href="/pos#download" cta={CTA.stickyDownload} heroRef={heroRef} />
      )}
      <Footer />
    </div>
  );
}
