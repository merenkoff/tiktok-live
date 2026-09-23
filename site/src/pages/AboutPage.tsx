import { Nav } from '../components/Nav';
import { Footer } from '../components/Footer';
import { CTAForm } from '../components/CTAForm';
import { Reveal } from '../components/Reveal';
import { VerticalCards } from '../components/VerticalCards';
import { ORG, PRODUCT, PRICING } from '../lib/productFacts';
import { Building2, Store, Radio, ShieldCheck } from 'lucide-react';

const FACTS = [
  {
    icon: Building2,
    t: 'Хто ми',
    d: `Власник сайту та сервісу — ${ORG.name}, код ЄДРПОУ ${ORG.taxId}. Українська компанія, продукт для українських магазинів, кав'ярень і квіткових.`,
  },
  {
    icon: Store,
    t: 'Що робимо',
    d: `${PRODUCT.pos.name} — каса для магазину одягу, квіткової крамниці, кав'ярні й ресторану: товари й склад, фіскальний чек ПРРО, QR-оплата і десктопний термінал, який продає без інтернету.`,
  },
  {
    icon: Radio,
    t: 'І ще — ефір',
    d: `${PRODUCT.live.name}: бот читає коментарі TikTok LIVE, тримає товар бронею, збирає дані покупця в Telegram і створює ТТН Нової Пошти.`,
  },
  {
    icon: ShieldCheck,
    t: 'Як працюємо',
    d: `${PRICING.pos.launch.label}, далі — помісячно і без передплати; ціна закріплюється за тими, хто підключився зараз. Замість тікетів підтримки — Telegram із розробником.`,
  },
];

export function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Nav variant="dovidka" activePath="/about" />

      <main className="flex-1">
        <section className="max-w-3xl mx-auto px-6 pt-16 pb-12">
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-wide text-pos">Про сервіс</p>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mt-3">
              LiveShop — каса і продажі в ефірі від однієї команди
            </h1>
            <p className="text-muted text-lg mt-5 leading-relaxed">
              Ми робимо касу для невеликого бізнесу в Україні — магазину одягу, квіткової крамниці,
              кав'ярні й ресторану — і бота, який продає в TikTok LIVE. Обидва продукти живуть на одному
              сервері, але підключаються окремо: беріть те, що зараз болить більше.
            </p>
          </Reveal>
        </section>

        <section className="max-w-6xl mx-auto px-6 pb-16">
          <div className="grid sm:grid-cols-2 gap-5">
            {FACTS.map((f) => (
              <Reveal key={f.t}>
                <div className="h-full border border-line rounded-card p-6 bg-paper">
                  <div className="w-10 h-10 rounded-full bg-pos/5 grid place-items-center">
                    <f.icon className="w-5 h-5 text-pos" strokeWidth={1.75} />
                  </div>
                  <h2 className="font-bold mt-4">{f.t}</h2>
                  <p className="text-muted text-sm mt-2.5 leading-relaxed">{f.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-6 pb-16">
          <Reveal>
            <h2 className="text-2xl font-bold mb-8">Для якого бізнесу</h2>
          </Reveal>
          <VerticalCards />
        </section>

        <section className="bg-mist border-y border-line">
          <div className="max-w-3xl mx-auto px-6 py-14">
            <Reveal>
              <h2 className="text-2xl font-bold">Реквізити</h2>
              <dl className="mt-6 grid sm:grid-cols-[auto_1fr] gap-x-8 gap-y-3 text-sm">
                <dt className="text-muted">Юридична особа</dt>
                <dd className="font-medium">{ORG.legalName}</dd>
                <dt className="text-muted">Код ЄДРПОУ</dt>
                <dd className="font-mono font-medium">{ORG.taxId}</dd>
                <dt className="text-muted">Сайт</dt>
                <dd>
                  <a href={ORG.url} className="text-pos font-semibold">
                    the-live.shop
                  </a>
                </dd>
                <dt className="text-muted">Код</dt>
                <dd>
                  <a href={ORG.sameAs[0]} rel="noopener" className="text-pos font-semibold">
                    github.com/merenkoff/tiktok-live
                  </a>
                  <span className="text-muted"> — source-available, ліцензія OwnNet Source License 1.1</span>
                </dd>
              </dl>
            </Reveal>
          </div>
        </section>

        <section className="max-w-3xl mx-auto px-6 py-16">
          <CTAForm
            id="cta"
            accent="pos"
            heading="Зв'язатися"
            subheading="Залиште ім'я і телефон — передзвонимо і покажемо касу на прикладі вашого бізнесу."
            buttonLabel="Замовити дзвінок"
            showNameField
          />
        </section>
      </main>

      <Footer />
    </div>
  );
}
