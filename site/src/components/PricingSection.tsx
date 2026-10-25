import { Reveal, StaggerGroup, StaggerItem } from './Reveal';
import { SectionHeading } from './SectionHeading';
import { ArrowRight, ChevronRight, Coins, Lock, MessageCircle, Sparkles } from './glyphs';
import { PRICING, COMPETITOR_FACTS, DEBTS_ADDON, addonPriceText, posAddon, priceLockNote, type PosAddon } from '../lib/productFacts';
import { CTA } from '../lib/ctaIds';

const { pos } = PRICING;
const cb = COMPETITOR_FACTS.checkbox;
const BASE = pos.plans[0];
const OWN = pos.plans[1];
const TABLES = posAddon('tables');
const LOCK_NOTE = priceLockNote(BASE);

/** «19.10.2026» from an ISO date, for copy. */
function uaDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/** The claim about Checkbox, built from the dated facts so it cannot drift from its source. */
export function checkboxComparison(): string {
  return (
    `${cb.name} з ${uaDate(cb.priceFromDate)} піднімає ціну з ${cb.priceNow} до ${cb.priceFrom} грн/міс за касу, ` +
    `а стару ціну дає зафіксувати лише передплатою до ${uaDate(cb.lockBy)} — на 1–${cb.lockMaxMonths} місяців і не далі ${uaDate(cb.lockUntil)}. ` +
    `Ми закріплюємо ціну за фактом підключення на період запуску і беремо оплату помісячно — без передплати.`
  );
}

const PERKS = [
  {
    icon: Lock,
    t: 'Ціна закріплюється',
    d: `${BASE.price} грн/міс — назавжди для тих, хто підключився зараз, скільки б не коштував тариф пізніше. Власний ПРРО — ${OWN.price} грн/міс на 2 роки з дня підключення.`,
  },
  {
    icon: Sparkles,
    t: 'Усі нові функції — у вашому тарифі',
    d: 'Те, що ми додамо до каси далі — лояльність, доставка, чайові, власний ПРРО, — входить у вашу ціну без доплат. Окремо оплачуються лише доповнення нижче: столи для ресторану й продаж під запис. Для тих, хто прийде пізніше, частина функцій буде у старших тарифах.',
  },
  {
    icon: MessageCircle,
    t: 'Прямий канал',
    d: 'Telegram із розробником замість тікетів підтримки — і голос у тому, що робити наступним.',
  },
];

/** The pricing block for /pos: the early-access offer the way /live states its own. */
export function PricingSection() {
  return (
    <section id="pricing" className="band scroll-mt-16">
      <div className="max-w-6xl mx-auto px-6 py-24">
        <Reveal>
          <SectionHeading
            icon={<Coins size={48} />}
            eyebrow="Ціна для перших користувачів"
            title={<>Безкоштовно на період запуску, далі від {BASE.price} грн/міс</>}
            lede="Ми запускаємось і шукаємо перші магазини, квіткові, кав'ярні й ресторани, які працюватимуть на касі щодня. Замість знижки на старті — умови, які лишаються з вами назавжди."
          />
        </Reveal>

        {/* The offer in one line: what you pay now, what you pay later, and that it never moves. */}
        <Reveal className="mt-12">
          <div className="card-flat p-6 sm:p-8 grid md:grid-cols-[auto_auto_1fr] gap-6 md:gap-10 items-center">
            <div>
              <p className="text-[13px] font-semibold text-muted">Зараз</p>
              <p className="mt-1">
                <span className="text-6xl font-bold tracking-tight tabular-nums text-ink-strong">0</span>
                <span className="text-muted text-sm ml-2">грн/міс</span>
              </p>
              <p className="text-muted text-sm mt-1">на період запуску</p>
            </div>
            <ArrowRight size={40} className="text-faint hidden md:block" />
            <div>
              <p className="text-[13px] font-semibold text-muted">Потім</p>
              <p className="mt-1">
                <span className="text-6xl font-bold tracking-tight tabular-nums text-pos">{BASE.price}</span>
                {LOCK_NOTE && (
                  <a href="#price-note" aria-label="Примітка до ціни" className="text-2xl font-bold text-pos align-top ml-0.5">
                    *
                  </a>
                )}
                <span className="text-muted text-sm ml-2">грн/міс за магазин</span>
              </p>
              <p className="text-body text-sm mt-1 flex items-center gap-1.5">
                <Lock size={24} className="shrink-0" />
                і ця ціна ваша назавжди — до {pos.perStoreRegisters} кас, помісячно, без передплати
              </p>
            </div>
          </div>
        </Reveal>

        <StaggerGroup className="mt-6 grid sm:grid-cols-3 gap-6">
          {PERKS.map((p) => (
            <StaggerItem key={p.t}>
              <div className="card-flat p-6 h-full">
                <p.icon size={24} />
                <h3 className="font-bold text-ink-strong mt-3">{p.t}</h3>
                <p className="text-muted text-[15px] mt-2 leading-relaxed">{p.d}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerGroup>

        {/* Plans */}
        <Reveal className="mt-16">
          <h3 className="text-2xl font-bold text-ink-strong text-center">Тарифи після запуску</h3>
        </Reveal>
        {/* Two plans and the add-ons — four cards, two by two on a tablet. */}
        <div className="mt-8 grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {pos.plans.map((plan) => (
            <Reveal key={plan.id}>
              <div className={`h-full p-6 flex flex-col ${plan.status === 'available' ? 'card ring-2 ring-pos' : 'card-flat'}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-ink-strong">{plan.name}</p>
                  {plan.status === 'coming' && (
                    <span className="text-xs font-semibold text-muted bg-paper rounded-full px-2.5 py-1">у розробці</span>
                  )}
                </div>
                <p className="mt-3">
                  <span className="text-4xl font-bold tracking-tight tabular-nums text-pos">{plan.price}</span>
                  <span className="text-sm ml-1.5 text-muted">грн/міс за магазин</span>
                </p>
                <p className="text-[15px] mt-3 leading-relaxed flex-1 text-muted">{plan.note}</p>
                <p className="text-xs mt-4 pt-3 border-t border-line text-muted">Ціна закріплюється {plan.lock}.</p>
              </div>
            </Reveal>
          ))}
          {pos.addons.map((addon) => (
            <Reveal key={addon.id}>
              <div className="h-full card-flat p-6 flex flex-col">
                <p className="font-bold text-ink-strong">{addon.name}</p>
                <p className="mt-3">
                  <span className="text-4xl font-bold tracking-tight tabular-nums text-ink-strong">
                    {addon.period === 'month' ? `+${addon.price}` : addon.price}
                  </span>
                  <span className="text-muted text-sm ml-1.5">{addon.period === 'month' ? 'грн/міс' : 'грн один раз'}</span>
                </p>
                <p className="text-muted text-[15px] mt-3 leading-relaxed flex-1">
                  {addon.note} Доповнення до будь-якого тарифу.
                </p>
                <p className="text-muted text-xs mt-4 pt-3 border-t border-line">{addon.forWhom}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Why monthly */}
        <Reveal className="mt-10">
          <div className="card-flat p-6 sm:p-8 grid md:grid-cols-[1fr_auto] gap-6 items-center">
            <div>
              <p className="font-bold text-ink-strong">Чому без передплати</p>
              <p className="mt-2 leading-relaxed text-body">{checkboxComparison()}</p>
              <p className="text-xs text-muted mt-3">
                Станом на {uaDate(cb.checkedAt)}, за{' '}
                <a href={cb.source} rel="nofollow noopener" target="_blank" className="text-pos font-semibold">
                  публікацією {cb.name}
                </a>
                . Підписку {cb.name} магазин оплачує окремо від нашої каси.
              </p>
            </div>
            <a href="#cta" className="btn-pos" data-cta={CTA.pricingFixPrice}>
              Зафіксувати ціну
            </a>
          </div>
        </Reveal>
        <p className="text-muted text-xs mt-6 text-center">
          Умови раннього доступу діють для магазинів, підключених на період запуску.
          {LOCK_NOTE && (
            <span id="price-note" className="block mt-1 scroll-mt-24">
              {LOCK_NOTE}
            </span>
          )}
        </p>
      </div>
    </section>
  );
}

/** One-line pricing card for the home page and the vertical landings; links to the full block. */
/**
 * `futureIncluded={false}` leaves out «Усе, що ми додамо далі, входить у вашу
 * ціну» — for a vertical whose promises the launch tariff does not (yet)
 * cover (`VerticalFact.roadmapInLaunchTariff`): the card then says what the
 * till costs and nothing about what comes next.
 */
export function PricingCard({
  addon,
  futureIncluded = true,
}: {
  /** The add-on this landing names next to the price: the restaurant's tables, the grocery's «Борги». */
  addon?: PosAddon['id'];
  futureIncluded?: boolean;
}) {
  return (
    <Reveal>
      <div className="card p-6 sm:p-8 grid sm:grid-cols-[auto_1fr_auto] gap-6 items-center">
        <p className="whitespace-nowrap">
          <span className="text-5xl font-bold tracking-tight tabular-nums text-ink-strong">0</span>
          <span className="text-muted text-sm ml-1.5">грн зараз</span>
        </p>
        <div>
          <p className="font-bold text-ink-strong flex items-center gap-2">
            <Lock size={24} className="shrink-0" />
            {/* One span, so the flex gap does not part the «*» from the price. */}
            <span>
              Потім {BASE.price}
              {LOCK_NOTE && (
                <a href="/pos#price-note" aria-label="Примітка до ціни" className="text-pos align-top">
                  *
                </a>
              )}{' '}
              грн/міс за магазин — і ця ціна ваша назавжди
            </span>
          </p>
          <p className="text-muted text-[15px] mt-1 leading-relaxed">
            До {pos.perStoreRegisters} кас{addon === 'tables' ? `, столи — ще ${TABLES.price} грн/міс` : ''}. Помісячно, без
            передплати.
            {addon === 'debts' && ` Продаж під запис (модуль «Борги») — ${addonPriceText(DEBTS_ADDON)}.`}
            {futureIncluded && ' Усе, що ми додамо далі, входить у вашу ціну.'}
          </p>
        </div>
        <a href="/pos#pricing" className="link-more text-[15px] whitespace-nowrap" data-cta={CTA.pricingCard}>
          Умови для перших <ChevronRight size={20} />
        </a>
      </div>
    </Reveal>
  );
}
