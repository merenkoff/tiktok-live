// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// One table on the hall map (phase К4e).
//
// Read from three metres away while walking: the number is the biggest thing
// on it, the colour says the state, and everything else is a line of small
// text under it. A free table shows its name and its seats and nothing more —
// there is nothing else true about it.

import { formatUah } from '@pos/platform';
import type { TableSeat, TableTone } from '../lib/hallMap';
import { seatedFor, tableTone } from '../lib/hallMap';

const TONE_CLASS: Record<TableTone, string> = {
  free: 'border-sq-divider bg-sq-surface text-sq-text',
  seated: 'border-sq-blue/40 bg-sq-blue/10 text-sq-text',
  waiting: 'border-amber-400/60 bg-amber-400/15 text-sq-text',
  ready: 'border-emerald-500/60 bg-emerald-500/20 text-sq-text',
};

const TONE_LABEL: Record<TableTone, string> = {
  free: 'вільний',
  seated: 'зайнятий',
  waiting: 'готується',
  ready: 'готово',
};

export interface TableTileProps {
  seat: TableSeat;
  /** The server's clock, so «seated for» does not depend on the tablet's. */
  now: string;
  onOpen: (seat: TableSeat) => void;
  disabled?: boolean;
}

export function TableTile({ seat, now, onOpen, disabled }: TableTileProps): JSX.Element {
  const { table, bill } = seat;
  const tone = tableTone(bill);
  return (
    <button
      type="button"
      data-testid={`table-tile-${table.id}`}
      data-tone={tone}
      disabled={disabled}
      onClick={() => onOpen(seat)}
      style={{
        gridColumn: `${table.pos_x + 1} / span ${table.width}`,
        gridRow: `${table.pos_y + 1} / span ${table.height}`,
      }}
      className={`flex min-h-20 flex-col items-center justify-center gap-0.5 border p-2 text-center transition disabled:opacity-60 ${
        table.shape === 'round' ? 'rounded-full' : 'rounded-xl'
      } ${TONE_CLASS[tone]}`}
    >
      <span className="text-2xl font-bold leading-none tabular-nums">{table.name}</span>
      {bill ? (
        <>
          <span className="text-xs tabular-nums">{formatUah(bill.fired_total_cents)}</span>
          <span className="text-[11px] text-sq-muted">
            {seatedFor(bill.opened_at, now)} · {bill.guests} гост.
          </span>
          <span className="sr-only">{TONE_LABEL[tone]}</span>
          {(bill.draft_count > 0 || bill.precheck_printed_at) && (
            <span className="flex items-center gap-1 text-[11px]">
              {bill.draft_count > 0 && (
                <span data-testid={`table-draft-${table.id}`} title="Не відправлено на кухню">
                  •
                </span>
              )}
              {bill.precheck_printed_at && (
                <span data-testid={`table-precheck-${table.id}`} title="Передчек надруковано">
                  ₴?
                </span>
              )}
            </span>
          )}
        </>
      ) : (
        <span className="text-[11px] text-sq-muted">{table.seats} місць</span>
      )}
    </button>
  );
}
