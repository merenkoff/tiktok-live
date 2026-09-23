import { Reveal, StaggerGroup, StaggerItem } from './Reveal';
import { Lock, Sparkles, MessageCircle, ArrowRight } from 'lucide-react';
import { PRICING, COMPETITOR_FACTS } from '../lib/productFacts';

const { pos } = PRICING;
const cb = COMPETITOR_FACTS.checkbox;
const BASE = pos.plans[0];
const OWN = pos.plans[1];
const TABLES = pos.addons[0];

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
    d: 'Те, що ми додамо до каси далі — лояльність, доставка, чайові, власний ПРРО, — входить у вашу ціну без доплат. Для тих, хто прийде пізніше, частина функцій буде у старших тарифах.',
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
    <section id="pricing" className="bg-ink text-white">
      <div className="max-w-6xl mx-auto px-6 py-20">
        <Reveal>
          <p className="text-sm font-semibold uppercase tracking-wide text-pos">Ціна для перших користувачів</p>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-3">
            Безкоштовно на період запуску, далі від {BASE.price} грн/міс
          </h2>
          <p className="text-white/70 mt-5 max-w-2xl leading-relaxed">
            Ми запускаємось і шукаємо перші магазини, квіткові, кав'ярні й ресторани, які працюватимуть
            на касі щодня. Замість знижки на старті — умови, які лишаються з вами назавжди.
          </p>
        </Reveal>

        {/* The offer in one line: what you pay now, what you pay later, and that it never moves. */}
        <Reveal className="mt-10">
          <div className="rounded-2xl bg-white/5 border border-white/10 p-6 sm:p-8 grid md:grid-cols-[auto_auto_1fr] gap-6 md:gap-10 items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Зараз</p>
              <p className="mt-1">
                <span className="font-mono text-6xl font-bold tracking-tight text-white">0</span>
                <span className="text-white/60 text-sm ml-2">грн/міс</span>
              </p>
              <p className="text-white/60 text-sm mt-1">на період запуску</p>
            </div>
            <ArrowRight className="w-7 h-7 text-white/30 hidden md:block" strokeWidth={1.5} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Потім</p>
              <p className="mt-1">
                <span className="font-mono text-6xl font-bold tracking-tight text-pos">{BASE.price}</span>
                <span className="text-white/60 text-sm ml-2">грн/міс за магазин</span>
              </p>
              <p className="text-white/80 text-sm mt-1 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-pos" strokeWidth={2} />
                і ця ціна ваша назавжди — до {pos.perStoreRegisters} кас, помісячно, без передплати
              </p>
            </div>
          </div>
        </Reveal>

        <StaggerGroup className="mt-6 grid sm:grid-cols-3 gap-4">
          {PERKS.map((p) => (
            <StaggerItem key={p.t}>
              <div className="bg-white/5 border border-white/10 rounded-card p-5 h-full">
                <p.icon className="w-5 h-5 text-pos" strokeWidth={1.75} />
                <h3 className="font-bold mt-4">{p.t}</h3>
                <p className="text-white/70 text-sm mt-2 leading-relaxed">{p.d}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerGroup>

        {/* Plans */}
        <Reveal className="mt-14">
          <p className="text-sm font-semibold uppercase tracking-wide text-white/50">Тарифи після запуску</p>
        </Reveal>
        <div className="mt-5 grid md:grid-cols-3 gap-4">
          {pos.plans.map((plan) => (
            <Reveal key={plan.id}>
              <div
                className={`h-full rounded-2xl p-6 flex flex-col border ${
                  plan.status === 'available' ? 'bg-paper text-ink border-transparent' : 'bg-white/5 border-white/10'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold">{plan.name}</p>
                  {plan.status === 'coming' && (
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-white/60 border border-white/20 rounded-full px-2 py-0.5">
                      у розробці
                    </span>
                  )}
                </div>
                <p className="mt-3">
                  <span className="font-mono text-4xl font-bold tracking-tight text-pos">{plan.price}</span>
                  <span className={`text-sm ml-1.5 ${plan.status === 'available' ? 'text-muted' : 'text-white/60'}`}>
                    грн/міс за магазин
                  </span>
                </p>
                <p className={`text-sm mt-3 leading-relaxed flex-1 ${plan.status === 'available' ? 'text-muted' : 'text-white/70'}`}>
                  {plan.note}
                </p>
                <p className={`text-xs mt-4 pt-3 border-t ${plan.status === 'available' ? 'text-muted border-line' : 'text-white/50 border-white/10'}`}>
                  Ціна закріплюється {plan.lock}.
                </p>
              </div>
            </Reveal>
          ))}
          <Reveal>
            <div className="h-full rounded-2xl p-6 flex flex-col bg-white/5 border border-white/10">
              <p className="font-bold">{TABLES.name}</p>
              <p className="mt-3">
                <span className="font-mono text-4xl font-bold tracking-tight text-white">+{TABLES.price}</span>
                <span className="text-white/60 text-sm ml-1.5">грн/міс</span>
              </p>
              <p className="text-white/70 text-sm mt-3 leading-relaxed flex-1">
                План залу, рахунки столів, раунди на кухню, передчек і розділення рахунку. Доповнення до
                будь-якого тарифу.
              </p>
              <p className="text-white/50 text-xs mt-4 pt-3 border-t border-white/10">Для ресторану з офіціантами.</p>
            </div>
          </Reveal>
        </div>

        {/* Why monthly */}
        <Reveal className="mt-10">
          <div className="rounded-2xl border border-white/10 p-6 sm:p-8 grid md:grid-cols-[1fr_auto] gap-6 items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-white/50">Чому без передплати</p>
              <p className="mt-2 leading-relaxed text-white/85">{checkboxComparison()}</p>
              <p className="text-xs text-white/50 mt-3">
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
        <p className="text-white/50 text-xs mt-6">
          Умови раннього доступу діють для магазинів, підключених на період запуску.
        </p>
      </div>
    </section>
  );
}

/** One-line pricing card for the home page and the vertical landings; links to the full block. */
export function PricingCard({ addon }: { addon?: boolean }) {
  return (
    <Reveal>
      <div className="rounded-2xl bg-ink text-white p-6 sm:p-8 grid sm:grid-cols-[auto_1fr_auto] gap-6 items-center">
        <p className="whitespace-nowrap">
          <span className="font-mono text-5xl font-bold tracking-tight">0</span>
          <span className="text-white/60 text-sm ml-1.5">грн зараз</span>
        </p>
        <div>
          <p className="font-bold flex items-center gap-2">
            <Lock className="w-4 h-4 text-pos" strokeWidth={2} />
            Потім {BASE.price} грн/міс за магазин — і ця ціна ваша назавжди
          </p>
          <p className="text-white/70 text-sm mt-1 leading-relaxed">
            До {pos.perStoreRegisters} кас{addon ? `, столи — ще ${TABLES.price} грн/міс` : ''}. Помісячно, без
            передплати. Усе, що ми додамо далі, входить у вашу ціну.
          </p>
        </div>
        <a href="/pos#pricing" className="text-sm font-semibold text-pos whitespace-nowrap">
          Умови для перших →
        </a>
      </div>
    </Reveal>
  );
}
