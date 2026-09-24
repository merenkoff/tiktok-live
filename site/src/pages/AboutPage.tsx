import { Nav } from '../components/Nav';
import { Footer } from '../components/Footer';
import { CTAForm } from '../components/CTAForm';
import { Reveal } from '../components/Reveal';
import { VerticalCards } from '../components/VerticalCards';
import { ORG, PRODUCT, PRICING } from '../lib/productFacts';
import { AppIcon } from '../components/AppIcon';
import { SectionHeading } from '../components/SectionHeading';
import { VerticalsMark } from '../components/VerticalsMark';
import { Building2, ShieldCheck, Store, Video } from '../components/glyphs';

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
    icon: Video,
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
        <section className="max-w-3xl mx-auto px-6 pt-16 sm:pt-20 pb-16 text-center">
          <Reveal className="flex flex-col items-center">
            <AppIcon size={112} className="drop-shadow-[0_12px_20px_rgba(0,30,80,0.2)]" />
            <p className="eyebrow text-pos mt-8">Про сервіс</p>
            <h1 className="h-display mt-3">
              LiveShop — каса і продажі в ефірі від однієї команди
            </h1>
            <p className="lede mt-6">
              Ми робимо касу для невеликого бізнесу в Україні — магазину одягу, квіткової крамниці,
              кав'ярні й ресторану — і бота, який продає в TikTok LIVE. Обидва продукти живуть на одному
              сервері, але підключаються окремо: беріть те, що зараз болить більше.
            </p>
          </Reveal>
        </section>

        <section className="max-w-6xl mx-auto px-6 pb-24">
          <div className="grid sm:grid-cols-2 gap-6">
            {FACTS.map((f) => (
              <Reveal key={f.t} className="h-full">
                <div className="h-full card p-7">
                  <f.icon size={24} />
                  <h2 className="text-lg font-bold text-ink-strong mt-3">{f.t}</h2>
                  <p className="text-muted text-[15px] mt-2 leading-relaxed">{f.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-6 pb-24">
          <Reveal>
            <SectionHeading icon={<VerticalsMark size={64} />} title="Для якого бізнесу" className="mb-12" />
          </Reveal>
          <VerticalCards />
        </section>

        <section className="band">
          <div className="max-w-3xl mx-auto px-6 py-20">
            <Reveal>
              <SectionHeading icon={<Building2 size={48} />} title="Реквізити" />
              <dl className="mt-10 card-flat p-6 sm:p-8 grid sm:grid-cols-[auto_1fr] gap-x-8 gap-y-3 text-[15px]">
                <dt className="text-muted">Юридична особа</dt>
                <dd className="font-medium">{ORG.legalName}</dd>
                <dt className="text-muted">Код ЄДРПОУ</dt>
                <dd className="tabular-nums font-medium">{ORG.taxId}</dd>
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

        <section className="max-w-3xl mx-auto px-6 py-24">
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
