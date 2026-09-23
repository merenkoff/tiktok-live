import { useRef } from 'react';
import { Nav } from '../components/Nav';
import { Footer } from '../components/Footer';
import { CTAForm } from '../components/CTAForm';
import { Faq } from '../components/Faq';
import { BrowserFrame } from '../components/BrowserFrame';
import { FeatureRow } from '../components/FeatureRow';
import { Reveal, StaggerGroup, StaggerItem } from '../components/Reveal';
import { DecorCircle } from '../components/DecorCircle';
import { StickyCta } from '../components/StickyCta';
import { VerticalCards } from '../components/VerticalCards';
import { PricingCard } from '../components/PricingSection';
import { useScrollToHash } from '../hooks/useScrollToHash';
import { PRICING } from '../lib/productFacts';
import type { VerticalPageData } from '../content/verticals';
import { ShieldCheck, WifiOff, Package, QrCode, Users, BarChart3 } from 'lucide-react';

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
  const heroRef = useRef<HTMLElement>(null);
  useScrollToHash();

  return (
    <div className="min-h-screen flex flex-col">
      <Nav variant="pos" activePath={fact.path} />

      <main className="flex-1">
        {/* Hero */}
        <section ref={heroRef} className="relative max-w-6xl mx-auto px-6 pt-16 pb-20 grid lg:grid-cols-2 gap-12 items-center">
          <DecorCircle colorClass="bg-pos/10" className="absolute -top-10 -left-16 w-72 h-72 sm:w-96 sm:h-96 -z-10" />
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-wide text-pos">{fact.eyebrow}</p>
            <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tighter mt-4 leading-[0.98]">{content.h1}</h1>
            <p className="text-muted text-lg mt-6 leading-relaxed">{content.lede}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="/pos#download" className="bg-pos hover:bg-pos-press transition-colors text-white text-sm font-semibold px-6 py-3.5 rounded-full">
                Завантажити POS
              </a>
              <a href="#cta" className="border border-line hover:border-ink transition-colors text-sm font-semibold px-6 py-3.5 rounded-full">
                Замовити демо
              </a>
            </div>
            <p className="text-sm text-muted mt-5">{PRICING.pos.label}.</p>
          </Reveal>
          <Reveal>
            <BrowserFrame src={content.hero.src} alt={content.hero.alt} accentClass="border-pos/30" elevated />
          </Reveal>
        </section>

        {/* Rows */}
        <section className="max-w-6xl mx-auto px-6 pb-8">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl font-bold text-center max-w-xl mx-auto">Як це виглядає на касі</h2>
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
              visual={row.shot ? <BrowserFrame src={row.shot.src} alt={row.shot.alt} accentClass="border-pos/20" /> : undefined}
            />
          ))}
        </section>

        {/* Shared core */}
        <section className="bg-mist border-y border-line">
          <div className="max-w-6xl mx-auto px-6 py-20">
            <Reveal>
              <h2 className="text-2xl sm:text-3xl font-bold text-center max-w-xl mx-auto">Спільне ядро для всіх</h2>
              <p className="text-muted text-center mt-3 max-w-xl mx-auto">
                Те, що є в касі незалежно від того, що ви продаєте. Докладно — на сторінці каси.
              </p>
            </Reveal>
            <StaggerGroup className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {CORE.map((c) => (
                <StaggerItem key={c.t}>
                  <a href={c.href} className="block h-full border border-line rounded-card p-5 bg-paper transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-lg hover:border-pos/30">
                    <div className="w-9 h-9 rounded-full bg-pos/5 grid place-items-center">
                      <c.icon className="w-4 h-4 text-pos" strokeWidth={1.75} />
                    </div>
                    <h3 className="font-bold mt-3">{c.t}</h3>
                    <p className="text-muted text-sm mt-1.5 leading-relaxed">{c.d}</p>
                  </a>
                </StaggerItem>
              ))}
            </StaggerGroup>
          </div>
        </section>

        {/* Pricing */}
        <section className="max-w-4xl mx-auto px-6 py-16">
          <PricingCard addon={fact.id === 'restaurant'} />
        </section>

        {/* Honest gaps */}
        <section className="max-w-4xl mx-auto px-6 pb-16">
          <Reveal>
            <h2 className="text-2xl font-bold">Чого поки немає</h2>
            <p className="text-muted mt-2 text-sm">
              Щоб ви не дізнались про це після підключення.
            </p>
            <ul className="mt-6 grid sm:grid-cols-2 gap-3">
              {content.missing.map((m) => (
                <li key={m} className="flex items-start gap-3 text-sm bg-paper border border-line rounded-card p-4">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-muted shrink-0" />
                  {m}
                </li>
              ))}
            </ul>
          </Reveal>
        </section>

        {/* FAQ */}
        <section className="max-w-3xl mx-auto px-6 pb-16">
          <Reveal>
            <h2 className="text-2xl sm:text-3xl font-bold mb-8">Питання, які запитують найчастіше</h2>
            <Faq items={content.faq} />
          </Reveal>
        </section>

        {/* Other verticals */}
        <section className="max-w-6xl mx-auto px-6 pb-16">
          <Reveal>
            <h2 className="text-2xl font-bold mb-8">Інший бізнес?</h2>
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
