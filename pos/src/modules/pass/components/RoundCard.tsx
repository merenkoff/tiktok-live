// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// One round of a table on «Роздача»: when it went to the kitchen, whether the
// kitchen called «Готово», and the plates still to carry — each a tap.

import { ChefHat } from '@pos/platform/ui';
import type { ServingLine, ServingRound } from '../lib/types';
import { dishTitle, hhmm, leftOf, minutesSince, servedWords, stationWord } from '../lib/feed';

interface Props {
  round: ServingRound;
  now: string;
  onDish: (line: ServingLine) => void;
}

export function RoundCard({ round, now, onDish }: Props): JSX.Element {
  const ready = round.prep_status === 'ready';
  const waited = minutesSince(ready ? round.ready_at ?? round.fired_at : round.fired_at, now);
  return (
    <section className="rounded-2xl bg-white shadow-card px-4 py-3" data-testid={`pass-round-${round.id}`}>
      <div className="flex items-center gap-2 pb-1.5 shadow-[0_1px_0_#E6E8EC]">
        <ChefHat size={22} />
        <p className="min-w-0 flex-1 truncate text-[15px] font-bold text-sq-heading">
          Раунд {round.seq}
          <span className="ml-2 font-normal text-[13px] text-sq-muted tabular-nums">
            {hhmm(round.fired_at)}
            {round.fired_by_name ? ` · ${round.fired_by_name}` : ''}
          </span>
        </p>
        <span
          className={`shrink-0 rounded-lg px-2 py-0.5 text-[13px] font-semibold tabular-nums ${
            ready ? 'bg-sq-success text-white' : 'bg-[#F4891F]/15 text-[#B35F0C]'
          }`}
          data-testid={`pass-round-state-${round.id}`}
        >
          {ready ? `готово · ${waited} хв` : `готується · ${waited} хв`}
        </span>
      </div>
      <div className="pt-1 divide-y divide-[#EEF0F3]">
        {round.items.map((line) => (
          <DishRow key={line.id} line={line} onTap={() => onDish(line)} />
        ))}
      </div>
    </section>
  );
}

function DishRow({ line, onTap }: { line: ServingLine; onTap: () => void }): JSX.Element {
  const left = leftOf(line);
  const station = stationWord(line.stations);
  const served = servedWords(line);
  return (
    <button
      type="button"
      className="w-full flex items-start gap-3 py-2.5 text-left active:bg-sq-blue/[0.06] rounded-lg"
      data-testid={`pass-dish-${line.id}`}
      onClick={onTap}
    >
      <span className="w-10 shrink-0 text-[19px] font-bold text-sq-heading tabular-nums">{left}×</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold text-sq-text">{dishTitle(line)}</span>
        {line.note && <span className="block text-[14px] font-semibold text-[#B35F0C]">{line.note}</span>}
        {served && <span className="block text-[13px] text-sq-muted">{served}</span>}
      </span>
      {station && (
        <span className="shrink-0 mt-0.5 rounded-md bg-sq-empty px-2 py-0.5 text-[12px] font-semibold text-sq-secondary">
          {station}
        </span>
      )}
    </button>
  );
}
