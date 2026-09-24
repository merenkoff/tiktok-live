import { useRef } from 'react';
import { Nav } from '../components/Nav';
import { Footer } from '../components/Footer';
import { CTAForm } from '../components/CTAForm';
import { Faq } from '../components/Faq';
import { BrowserFrame } from '../components/BrowserFrame';
import { FeatureRow } from '../components/FeatureRow';
import { Reveal, StaggerGroup, StaggerItem } from '../components/Reveal';
import { SectionHeading } from '../components/SectionHeading';
import { StickyCta } from '../components/StickyCta';
import { VerticalCards, VERTICAL_GLYPH } from '../components/VerticalCards';
import { PricingCard } from '../components/PricingSection';
import { Roadmap } from '../components/Roadmap';
import { useScrollToHash } from '../hooks/useScrollToHash';
import { PRICING, roadmapFor } from '../lib/productFacts';
import type { VerticalPageData } from '../content/verticals';
import { BarChart3, ChevronRight, MessageCircle, Package, QrCode, ShieldCheck, Users, WifiOff } from '../components/glyphs';

/** The core every vertical shares; short on purpose — /pos tells the long version. */
const CORE = [
  { icon: ShieldCheck, t: 'ПРРО через Checkbox', d: 'Зміни, Z-звіт, фіскальний чек із QR — онлайн і офлайн.', href: '/pos#prro' },
  { icon: WifiOff, t: 'Каса без інтернету', d: 'Десктопна каса продає з локальної копії й синхронізується потім.', href: '/pos#download' },
  { icon: Package, t: 'Склад документами', d: 'Прихід, списання, інвентаризація — з проведенням і сторно.', href: '/pos' },
  { icon: QrCode, t: 'QR-оплата', d: 'Динамічний QR, оплата підтверджується сама.', href: '/pos' },
  { icon: Users, t: 'Власник і продавець', d: 'Кабінет по email, каса за PIN — ролі розділені.', href: '/pos' },
  { icon: BarChart3, t: 'Аналітика', d: 'Продажі по днях, середній чек, топ товарів — у кабінеті.', href: '/pos' },
];

export function VerticalPage({ page }: { page: VerticalPageData }) {
  const { fact, content } = page;
  const Mark = VERTICAL_GLYPH[fact.id];
  const heroRef = useRef<HTMLElement>(null);
  useScrollToHash();

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
            <p className="eyebrow text-pos mt-8">{fact.eyebrow}</p>
            <h1 className="h-display mt-3 max-w-4xl">{content.h1}</h1>
            <p className="lede mt-6 max-w-2xl">{content.lede}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
              <a href="/pos#download" className="btn-pos">
                Завантажити POS
              </a>
              <a href="#cta" className="link-more text-[17px]">
                Замовити демо <ChevronRight size={20} />
              </a>
            </div>
            <p className="text-sm text-muted mt-5">{PRICING.pos.label}.</p>
          </Reveal>
          <Reveal className="mt-14 max-w-5xl mx-auto">
            <BrowserFrame src={content.hero.src} alt={content.hero.alt} elevated />
          </Reveal>
        </section>

        {/* Rows */}
        <section className="max-w-6xl mx-auto px-6 pb-12">
          <Reveal>
            <SectionHeading icon={<Mark size={48} />} title="Як це виглядає на касі" />
          </Reveal>
          {content.rows.map((row, i) => (
            <FeatureRow
              key={row.title}
              eyebrow={row.eyebrow}
              title={row.title}
              body={row.body}
              bullets={row.bullets}
              accentClass="text-pos"
              reverse={i % 2 === 1}
              visual={row.shot ? <BrowserFrame src={row.shot.src} alt={row.shot.alt} /> : undefined}
            />
          ))}
        </section>

        {/* Shared core */}
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

        {/* Pricing */}
        <section className="max-w-4xl mx-auto px-6 py-20">
          <PricingCard addon={fact.id === 'restaurant'} />
        </section>

        {/* Coming soon */}
        <Roadmap items={roadmapFor(fact.id)} lede="Усе це входить у тариф тих, хто підключився на період запуску." />

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
            accent="pos"
            heading="Готові підключити касу?"
            subheading="Залиште ім'я і телефон — покажемо на прикладі вашого бізнесу."
            buttonLabel="Замовити демо"
            showNameField
          />
        </section>
      </main>

      <StickyCta accent="pos" label="Завантажити POS" href="/pos#download" heroRef={heroRef} />
      <Footer />
    </div>
  );
}
