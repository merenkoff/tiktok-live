// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Роздача» — the waiter's screen of what the kitchen's rounds still have to
// carry (TechDocs/POS_PASS.md, B2; the owner's layout, variant A of Д2):
//
//   [ Усі 7 ] [ ● Стіл 5 · 3 ] [ Стіл 2 · 4 ] [ Тераса 1 · 0 ] →
//   Стіл 5 — its rounds, the plates still to carry
//   Інші столи — everybody else's, in the order to walk
//   Винесено — what of table 5 has gone out, with «Повернути»
//
// A tap on a plate asks «Несете на стіл 5?» first; «Несу» takes it off the
// list at once and leaves «Повернути» on the screen for five seconds.
//
// Online only: a plate is carried now, and a tap the server never heard is
// worse than none — there is no mirror and no queue.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore, useOfflineStatus } from '@pos/platform';
import { UtensilsCrossed } from '@pos/platform/ui';
import { CarrySheet } from '../components/CarrySheet';
import { RoundCard } from '../components/RoundCard';
import { ServedHistory } from '../components/ServedHistory';
import { TableChips } from '../components/TableChips';
import type { Selection } from '../components/TableChips';
import { UndoToast } from '../components/UndoToast';
import { chipOrder, liveRounds, roomToServe } from '../lib/feed';
import { usePass } from '../lib/usePass';
import type { ServingLine, ServingTable } from '../lib/types';

export function PassPage(): JSX.Element {
  const online = useOfflineStatus((s) => s.online);
  const remotes = useAuthStore((s) => s.auth?.store.module_remotes);
  // Unknown (an older login without the map) is not «missing»: only a map
  // that is there and lacks `tables` says so.
  const noTables = remotes != null && !('tables' in remotes);
  const [selected, setSelected] = useState<Selection>('all');
  const [sheet, setSheet] = useState<{ table: ServingTable; line: ServingLine } | null>(null);
  const [writing, setWriting] = useState(false);
  // Without «Столи» there is nothing to read: the page says why instead.
  const pass = usePass({ online: online && !noTables, billId: selected === 'all' ? null : selected });

  const ordered = useMemo(() => (pass.feed ? chipOrder(pass.feed.tables) : []), [pass.feed]);
  const chosen = selected === 'all' ? null : ordered.find((t) => t.bill_id === selected) ?? null;

  // A bill paid or closed elsewhere leaves the row: back to the whole room.
  useEffect(() => {
    if (pass.feed && selected !== 'all' && !pass.feed.tables.some((t) => t.bill_id === selected)) {
      setSelected('all');
    }
  }, [pass.feed, selected]);

  const carry = async (quantity: number): Promise<void> => {
    if (!sheet) return;
    const { line } = sheet;
    setSheet(null);
    setWriting(true);
    await pass.carry([{ line, quantity }]);
    setWriting(false);
  };

  const undo = async (eventIds: number[]): Promise<void> => {
    setWriting(true);
    await pass.undo(eventIds);
    setWriting(false);
  };

  const { clearToast } = pass;
  const dismissToast = useCallback(() => clearToast(), [clearToast]);

  if (noTables) {
    return (
      <div className="p-4" data-testid="pass-needs-tables">
        <div className="sq-card p-6 text-center">
          <p className="text-lg font-semibold">Потрібен модуль «Столи»</p>
          <p className="mt-1 text-sm text-sq-muted">
            «Роздача» показує раунди з рахунків столів — без «Столів» їх немає. Підключіть «Столи» у магазині.
          </p>
        </div>
      </div>
    );
  }

  if (!online && !pass.feed) {
    return (
      <div className="p-4" data-testid="pass-offline">
        <div className="sq-card p-6 text-center">
          <p className="text-lg font-semibold">Потрібна мережа</p>
          <p className="mt-1 text-sm text-sq-muted">Що винесли, бачать усі офіціанти й кухня — без звʼязку цього не відмітити.</p>
        </div>
      </div>
    );
  }

  if (pass.loading && !pass.feed) return <p className="p-6 text-center text-sm text-sq-muted">Завантаження…</p>;

  if (!pass.feed) {
    return (
      <div className="p-4">
        <div className="sq-card p-6 text-center">
          <p className="text-sm">{pass.error ?? 'Не вдалося прочитати роздачу'}</p>
          <button type="button" className="sq-btn-primary mt-3 px-4 py-2.5" onClick={() => void pass.reload()}>
            Повторити
          </button>
        </div>
      </div>
    );
  }

  const now = pass.feed.now;
  const others = ordered.filter((t) => t.bill_id !== chosen?.bill_id && liveRounds(t).length > 0);
  const open = (table: ServingTable) => (line: ServingLine) => setSheet({ table, line });

  const tableSection = (table: ServingTable, titled: boolean): JSX.Element => {
    const rounds = liveRounds(table);
    return (
      <section key={table.bill_id} className="space-y-2.5" data-testid={`pass-table-${table.bill_id}`}>
        {titled && (
          <h2 className="pt-2 text-[17px] font-bold text-sq-heading">
            Стіл {table.table_name}
            <span className="ml-2 text-[13px] font-normal text-sq-muted">
              {table.hall_name}
              {table.opened_by_name ? ` · ${table.opened_by_name}` : ''}
            </span>
          </h2>
        )}
        {rounds.map((round) => (
          <RoundCard key={round.id} round={round} now={now} onDish={open(table)} />
        ))}
      </section>
    );
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col" data-testid="pass-page">
      <header className="flex shrink-0 items-center gap-3 px-4 md:px-6 min-h-[60px] pt-2">
        <UtensilsCrossed size={28} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-sq-heading">Роздача</h1>
          <p className="truncate text-[13px] text-sq-muted">Що з кухні ще треба винести на столи</p>
        </div>
      </header>

      <TableChips tables={ordered} selected={selected} roomCount={roomToServe(ordered)} onSelect={setSelected} />

      {!online && (
        <p className="mx-4 md:mx-6 mt-1 rounded-sq bg-amber-50 text-amber-900 px-3 py-2 text-sm" data-testid="pass-stale">
          Немає звʼязку — список станом на останнє оновлення. Відмітити винос можна лише онлайн.
        </p>
      )}
      {pass.banner && (
        <p className="mx-4 md:mx-6 mt-1 rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm" data-testid="pass-banner">
          {pass.banner}{' '}
          <button type="button" className="sq-link" onClick={pass.clearBanner}>
            Зрозуміло
          </button>
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto px-4 md:px-6 pt-2 pb-28 space-y-3">
        {chosen ? (
          <>
            {liveRounds(chosen).length > 0 ? (
              tableSection(chosen, true)
            ) : (
              <p className="pt-2 text-[15px] text-sq-muted" data-testid="pass-table-done">
                Зі столу {chosen.table_name} усе винесено.
              </p>
            )}
            {others.length > 0 && (
              <>
                <p className="pt-3 text-[13px] font-semibold uppercase tracking-wide text-sq-secondary">Інші столи</p>
                {others.map((t) => tableSection(t, true))}
              </>
            )}
            {pass.history && (
              <div className="pt-3">
                <ServedHistory rows={pass.history} busy={writing} onUndo={(row) => void undo([row.id])} />
              </div>
            )}
          </>
        ) : others.length > 0 ? (
          others.map((t) => tableSection(t, true))
        ) : (
          <div className="sq-card mt-2 p-6 text-center" data-testid="pass-empty">
            <p className="text-lg font-semibold">Усе винесено</p>
            <p className="mt-1 text-sm text-sq-muted">
              {ordered.length === 0 ? 'Відкритих рахунків немає.' : 'На роздачі нічого не чекає на офіціанта.'}
            </p>
          </div>
        )}
      </div>

      {sheet && (
        <CarrySheet
          tableName={sheet.table.table_name}
          line={sheet.line}
          busy={writing}
          onCarry={(quantity) => void carry(quantity)}
          onClose={() => setSheet(null)}
        />
      )}

      {pass.toast && (
        <UndoToast
          text={pass.toast.text}
          busy={writing}
          onUndo={() => void undo(pass.toast?.eventIds ?? [])}
          onDismiss={dismissToast}
        />
      )}
    </div>
  );
}
