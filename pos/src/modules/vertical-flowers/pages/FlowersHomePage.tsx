// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * «Квіти» — the module's own screen.
 *
 * Today it only shows that the module is live and what the store's flower
 * schema is, which is genuinely useful when a release is being rolled out to a
 * till: the cashier can say whether their machine has it.
 *
 * It also exists for a structural reason. A `module_remotes` entry must declare
 * a `routePath` and at least one nav item on both sides (`parsePresentation`,
 * `sanitizeRemoteNav`) — which is right: a downloaded module a cashier cannot
 * see anywhere is a support call waiting to happen, and on the desktop this is
 * what the greyed "not downloaded yet" placeholder points at. Bouquets,
 * write-offs and pre-orders land here.
 */

import { useVertical } from '@pos/platform';
import { POS_APP_VERSION } from '@pos/platform';

export default function FlowersHomePage() {
  const vertical = useVertical();

  return (
    <div className="p-4 space-y-4 text-sq-text">
      <div>
        <h1 className="text-lg font-semibold">Квіти</h1>
        <p className="text-sm text-sq-secondary mt-1">
          Модуль активний на цій касі, версія {POS_APP_VERSION}.
        </p>
      </div>

      <section className="rounded-sq border border-sq-divider bg-sq-surface p-4">
        <p className="sq-section-label">Поля товару</p>
        {vertical.id === 'flowers' ? (
          <ul className="mt-2 space-y-1 text-sm">
            {vertical.attributes.map((spec) => (
              <li key={spec.key} className="text-sq-secondary">
                <span className="text-sq-text">{spec.label}</span>
                {spec.unitSuffix ? `, ${spec.unitSuffix}` : ''} · {spec.key}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-amber-700">
            Магазин зараз не на квітковій вертикалі — каса продає на загальному екрані.
            Тип магазину змінює адміністратор платформи.
          </p>
        )}
      </section>

      <p className="text-xs text-sq-muted">
        Букети, списання та передзамовлення зʼявляться тут у наступних версіях модуля.
      </p>
    </div>
  );
}
