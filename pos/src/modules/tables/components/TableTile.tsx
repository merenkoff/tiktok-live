// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// One table on the hall map (phase К4e).
//
// Read from three metres away while walking: the number is the biggest thing
// on it, the ring says whose table it is and whether it asked for the bill,
// and everything else is a line of small text under it. A free table shows its
// seats and nothing more — there is nothing else true about it.

import { Pencil } from '@pos/platform/ui';
import type { TableSeat, TableTone } from '../lib/hallMap';
import { guestsLabel, kitchenState, seatedFor, seatsLabel, tableTone, tileSum } from '../lib/hallMap';

/** Ring, fill and dot per state — the board's legend: вільний / мій / зайнятий / просять рахунок. */
const TONE: Record<TableTone, { tile: string; dot: string | null }> = {
  free: { tile: 'bg-white ring-1 ring-[#E6E8EC]', dot: null },
  mine: { tile: 'bg-sq-blue/[0.06] ring-2 ring-sq-blue', dot: 'bg-sq-blue' },
  busy: { tile: 'bg-white ring-2 ring-[#F8C00F]', dot: 'bg-[#F8C00F]' },
  bill: { tile: 'bg-white ring-2 ring-sq-danger', dot: 'bg-sq-danger' },
};

const TONE_LABEL: Record<TableTone, string> = {
  free: 'Вільний',
  mine: 'Мій стіл',
  busy: 'Зайнятий',
  bill: 'Просять рахунок',
};

export interface TableTileProps {
  seat: TableSeat;
  /** The server's clock, so «seated for» does not depend on the tablet's. */
  now: string;
  /** The staff member holding the till — whose tables are «мій стіл». */
  meId: number | null;
  onOpen: (seat: TableSeat) => void;
  disabled?: boolean;
}

export function TableTile({ seat, now, meId, onOpen, disabled }: TableTileProps): JSX.Element {
  const { table, bill } = seat;
  const tone = tableTone(bill, meId);
  const kitchen = kitchenState(bill);
  const round = table.shape === 'round';
  return (
    <button
      type="button"
      data-testid={`table-tile-${table.id}`}
      data-tone={tone}
      data-kitchen={kitchen ?? undefined}
      disabled={disabled}
      onClick={() => onOpen(seat)}
      style={{
        gridColumn: `${table.pos_x + 1} / span ${table.width}`,
        gridRow: `${table.pos_y + 1} / span ${table.height}`,
      }}
      className={`relative flex min-h-24 flex-col items-center justify-center gap-0.5 p-3 text-center shadow-card transition active:scale-[0.99] disabled:opacity-60 ${
        round ? 'rounded-full' : 'rounded-card'
      } ${TONE[tone].tile}`}
    >
      {TONE[tone].dot && (
        <span
          aria-hidden
          className={`absolute top-3 w-2.5 h-2.5 rounded-full ${round ? 'right-[18%]' : 'right-3.5'} ${TONE[tone].dot}`}
        />
      )}
      {(kitchen || (bill && bill.draft_count > 0)) && (
        <span className={`absolute top-2.5 flex items-center gap-1 ${round ? 'left-[16%]' : 'left-3'}`}>
          {kitchen && (
            <span
              className={`h-5 px-1.5 rounded-md text-[11px] font-semibold inline-flex items-center ${
                kitchen === 'ready' ? 'bg-sq-success text-white' : 'bg-sq-warning/15 text-[#B35F0C]'
              }`}
            >
              {kitchen === 'ready' ? 'готово' : 'готується'}
            </span>
          )}
          {bill && bill.draft_count > 0 && (
            <span data-testid={`table-draft-${table.id}`} title="Не відправлено на кухню" className="text-sq-blue">
              <Pencil size={16} aria-label="Не відправлено на кухню" />
            </span>
          )}
        </span>
      )}
      <span className="text-[30px] font-bold leading-none text-sq-heading tabular-nums">{table.name}</span>
      {bill ? (
        <>
          {tone === 'bill' ? (
            <span className="text-[13px] font-semibold text-sq-danger" data-testid={`table-precheck-${table.id}`}>
              Просять рахунок
            </span>
          ) : (
            <span className="text-[13px] font-semibold text-sq-text tabular-nums">
              {tileSum(bill.fired_total_cents)} · {seatedFor(bill.opened_at, now)}
            </span>
          )}
          <span className="text-xs text-sq-muted truncate max-w-full">
            {guestsLabel(bill.guests)}
            {bill.opened_by_name ? ` · ${bill.opened_by_name}` : ''}
          </span>
          <span className="sr-only">{TONE_LABEL[tone]}</span>
        </>
      ) : (
        <span className="text-[13px] text-sq-muted">{seatsLabel(table.seats)}</span>
      )}
    </button>
  );
}

/** The four states in words, for the header — the same colours as the tiles. */
export function ToneLegend(): JSX.Element {
  const dots: Record<TableTone, string> = {
    free: 'bg-sq-divider',
    mine: 'bg-sq-blue',
    busy: 'bg-[#F8C00F]',
    bill: 'bg-sq-danger',
  };
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-sq-secondary" data-testid="tables-legend">
      {(Object.keys(dots) as TableTone[]).map((tone) => (
        <span key={tone} className="flex items-center gap-1.5">
          <span aria-hidden className={`w-2.5 h-2.5 rounded-full ${dots[tone]}`} />
          {TONE_LABEL[tone]}
        </span>
      ))}
    </div>
  );
}
