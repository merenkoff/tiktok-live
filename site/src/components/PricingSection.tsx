import { Reveal } from './Reveal';
import { PRICING, COMPETITOR_FACTS } from '../lib/productFacts';

const { pos } = PRICING;
const cb = COMPETITOR_FACTS.checkbox;

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

/** Full pricing block for /pos: three columns, the fine print and the comparison. */
export function PricingSection() {
  return (
    <section id="pricing" className="bg-mist border-y border-line">
      <div className="max-w-6xl mx-auto px-6 py-20">
        <Reveal>
          <p className="text-sm font-semibold uppercase tracking-wide text-pos text-center">Тариф</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-center mt-3">
            {pos.launch.label}
          </h2>
          <p className="text-muted text-center mt-4 max-w-2xl mx-auto leading-relaxed">
            Далі — за магазин, до {pos.perStoreRegisters} кас включно, залежно від того, хто фіскалізує чеки.{' '}
            {pos.billing} Хто підключився на період запуску — лишається на цій ціні.
          </p>
        </Reveal>

        <div className="mt-12 grid md:grid-cols-3 gap-6">
          {pos.plans.map((plan) => (
            <Reveal key={plan.id}>
              <div
                className={`h-full rounded-2xl border bg-paper p-7 flex flex-col ${
                  plan.status === 'available' ? 'border-pos shadow-lg' : 'border-line'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold">{plan.name}</p>
                  {plan.status === 'coming' && (
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted border border-line rounded-full px-2 py-0.5">
                      у розробці
                    </span>
                  )}
                </div>
                <p className="mt-4">
                  <span className="font-mono text-5xl font-bold tracking-tight text-pos">{plan.price}</span>
                  <span className="text-muted text-sm ml-1.5">грн/міс за магазин</span>
                </p>
                <p className="text-muted text-sm mt-4 leading-relaxed flex-1">{plan.note}</p>
                <p className="text-xs text-muted mt-5 border-t border-line pt-4">Ціна закріплюється {plan.lock}.</p>
              </div>
            </Reveal>
          ))}
          {pos.addons.map((addon) => (
            <Reveal key={addon.id}>
              <div className="h-full rounded-2xl border border-line bg-paper p-7 flex flex-col">
                <p className="font-bold">{addon.name}</p>
                <p className="mt-4">
                  <span className="font-mono text-5xl font-bold tracking-tight text-ink">+{addon.price}</span>
                  <span className="text-muted text-sm ml-1.5">грн/міс</span>
                </p>
                <p className="text-muted text-sm mt-4 leading-relaxed flex-1">
                  План залу, рахунки столів, раунди на кухню, передчек і розділення рахунку. Доповнення до
                  будь-якого тарифу.
                </p>
                <p className="text-xs text-muted mt-5 border-t border-line pt-4">Для ресторану з офіціантами.</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-10">
          <div className="rounded-2xl border border-line bg-paper p-6 sm:p-8 grid md:grid-cols-[1fr_auto] gap-6 items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-muted">Чому помісячно</p>
              <p className="mt-2 leading-relaxed">{checkboxComparison()}</p>
              <p className="text-xs text-muted mt-3">
                Станом на {uaDate(cb.checkedAt)}, за{' '}
                <a href={cb.source} rel="nofollow noopener" target="_blank" className="text-pos font-semibold">
                  публікацією {cb.name}
                </a>
                . Підписку {cb.name} магазин оплачує окремо від нашої каси.
              </p>
            </div>
            <a
              href="#cta"
              className="bg-pos hover:bg-pos-press transition-colors text-white text-sm font-semibold px-6 py-3.5 rounded-full text-center"
            >
              Зафіксувати ціну
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/** One-line pricing card for the home page and the vertical landings; links to the full block. */
export function PricingCard({ addon }: { addon?: boolean }) {
  const from = pos.plans[0].price;
  const tables = pos.addons[0];
  return (
    <Reveal>
      <div className="rounded-2xl border border-line bg-mist p-6 sm:p-8 grid sm:grid-cols-[auto_1fr_auto] gap-6 items-center">
        <p>
          <span className="font-mono text-5xl font-bold tracking-tight text-pos">0</span>
          <span className="text-muted text-sm ml-1.5">грн зараз</span>
        </p>
        <div>
          <p className="font-bold">{pos.launch.label}</p>
          <p className="text-muted text-sm mt-1 leading-relaxed">
            Далі від {from} грн/міс за магазин до {pos.perStoreRegisters} кас
            {addon ? ` + ${tables.price} грн/міс за столи` : ''}. {pos.billing} Ціна закріплюється за тими, хто
            підключився зараз.
          </p>
        </div>
        <a href="/pos#pricing" className="text-sm font-semibold text-pos whitespace-nowrap">
          Усі тарифи →
        </a>
      </div>
    </Reveal>
  );
}
