// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The hall map — the waiter's home screen (phase К4e, TechDocs/POS_TABLES.md
// §3.1).
//
// One tap does both things: an empty table is seated, an occupied one is
// opened. That is not a shortcut, it is what the server does — `POST /bills`
// answers with the bill already on the table rather than refusing (К4b) — so
// the screen has no reason to ask which the waiter meant.
//
// The layout is the owner's, in grid CELLS: a table's `pos_x`/`pos_y` and its
// width and height are cell coordinates (§4.8), so the same room reads the
// same on a laptop and on a tablet. Tables may overlap — a sofa stands
// against a wall — and nothing here tries to prevent it.
//
// The requests guests send from the QR menu (Q7) are listed above the room,
// not only badged on their tiles: a FREE table has no bill to open, so the map
// is where its request is answered — and answering it is the one thing here
// that seats a table for the waiter, because accepting opens the bill.
//
// Writes are online only, and the screen says so rather than pretending: the
// bill lives on the server (§4.10). Reads are not: К4j gives the till a
// read-only mirror, so when the Wi-Fi blinks the waiter still sees which
// tables are taken, for how long and for how much — with «станом на» over it,
// because a map that might be minutes old must never pass for a live one.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, useOfflineStatus, usePosShell } from '@pos/platform';
import { Bell } from '@pos/platform/ui';
import { GuestOrdersPanel } from '../components/GuestOrdersPanel';
import type { AcceptOutcome } from '../components/GuestOrdersPanel';
import { TableTile, ToneLegend } from '../components/TableTile';
import { hallExtent, seatsOfHall, visibleHalls } from '../lib/hallMap';
import type { TableSeat } from '../lib/hallMap';
import { refusedLineId, requestsLabel, waitingByTable } from '../lib/guestOrders';
import type { GuestOrder } from '../lib/types';
import { useGuestOrders } from '../lib/useGuestOrders';
import { serverMessage, useHallMap } from '../lib/useHallMap';
import * as tablesApi from '../lib/tablesApi';

/** `20:41` on the device clock — what «станом на» reads. */
function savedAtLabel(at: number): string {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function HallMapPage(): JSX.Element {
  const online = useOfflineStatus((s) => s.online);
  const shell = usePosShell();
  const storeId = useAuthStore((s) => s.auth?.store.id ?? null);
  const meId = useAuthStore((s) => s.auth?.staff.id ?? null);
  const { halls, bills, now, loading, error, stale, savedAt, refresh } = useHallMap({
    online,
    // The till and the tablet PWA keep a copy; the web shell has no offline
    // runtime at all (§4.12), so a mirror written there could never be read
    // back.
    mirrored: shell !== 'web',
    storeId,
  });
  const { orders: requests, refresh: refreshRequests } = useGuestOrders({ online });
  const [hallId, setHallId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  // A success worth a line («прийнято»), which is not an error and must not
  // wear the red of one.
  const [note, setNote] = useState<string | null>(null);
  const navigate = useNavigate();

  const waiting = useMemo(() => waitingByTable(requests), [requests]);

  useEffect(() => {
    if (note == null) return;
    const id = setTimeout(() => setNote(null), 8000);
    return () => clearTimeout(id);
  }, [note]);

  const rooms = useMemo(() => visibleHalls(halls, bills), [halls, bills]);
  const current = rooms.find((h) => h.id === hallId) ?? rooms[0] ?? null;
  const seats = useMemo(
    () => (current ? seatsOfHall(current, bills) : []),
    [current, bills]
  );
  const extent = useMemo(() => hallExtent(seats), [seats]);

  async function open(seat: TableSeat): Promise<void> {
    if (busy) return;
    // Seating a table is a write, and a write needs the server — the mirror
    // is a cache, not a queue (§4.10). Said here, before the request times
    // out somewhere the waiter cannot see.
    if (!online) {
      setBanner('Потрібна мережа, щоб відкрити стіл');
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      const opened = await tablesApi.seatTable(seat.table.id);
      navigate(`/tables/${opened.bill.id}`);
    } catch (err) {
      setBanner(serverMessage(err, 'Не вдалося відкрити стіл'));
      void refresh();
    } finally {
      setBusy(false);
    }
  }

  /**
   * Accept a guest's request: its lines go into the table's bill under this
   * waiter's name, and to the kitchen when the draft held nothing of the
   * waiter's own. When it could not go all the way — the round did not go out,
   * or the waiter had lines of their own in the draft — the bill opens with the
   * server's warning on it, because that is where the rest of the job is.
   */
  async function acceptRequest(order: GuestOrder, excludeLineIds: number[]): Promise<AcceptOutcome> {
    if (busy) return { ok: false };
    if (!online) {
      setBanner('Потрібна мережа, щоб прийняти запит');
      return { ok: false };
    }
    setBusy(true);
    setBanner(null);
    setNote(null);
    try {
      const done = await tablesApi.acceptGuestOrder(order.id, excludeLineIds);
      void refreshRequests();
      void refresh();
      if (done.warning) {
        navigate(`/tables/${done.bill.id}`, { state: { notice: done.warning } });
      } else {
        setNote(
          done.already
            ? `Стіл ${order.table_name}: запит уже було прийнято`
            : `Стіл ${order.table_name}: прийнято — замовлення на кухні`
        );
      }
      return { ok: true };
    } catch (err) {
      // The server's words say which dish and why («сьогодні в стоп-листі»);
      // the card marks the line the server named, so the next tap can go
      // without it.
      setBanner(serverMessage(err, 'Не вдалося прийняти запит'));
      void refreshRequests();
      return { ok: false, refusedLineId: refusedLineId(err) };
    } finally {
      setBusy(false);
    }
  }

  async function rejectRequest(order: GuestOrder, reason: string | null): Promise<boolean> {
    if (busy) return false;
    if (!online) {
      setBanner('Потрібна мережа, щоб відхилити запит');
      return false;
    }
    setBusy(true);
    setBanner(null);
    setNote(null);
    try {
      await tablesApi.rejectGuestOrder(order.id, reason ?? undefined);
      void refreshRequests();
      setNote(`Стіл ${order.table_name}: запит відхилено`);
      return true;
    } catch (err) {
      setBanner(serverMessage(err, 'Не вдалося відхилити запит'));
      void refreshRequests();
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Offline with nothing remembered — the honest empty state. With a mirror
  // the map draws below instead, marked as a memory.
  if (!online && !stale && !loading) {
    return (
      <div className="p-4" data-testid="tables-offline">
        <div className="sq-card p-6 text-center">
          <p className="text-lg font-semibold">Потрібна мережа</p>
          <p className="mt-1 text-sm text-sq-muted">
            Рахунок столу живе на сервері — без звʼязку його не відкрити.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-sq-bg" data-testid="hall-map">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 md:px-7 py-4 md:min-h-[72px] shrink-0">
        <h1 className="text-2xl font-bold text-sq-heading">Столи</h1>
        {rooms.length > 1 && (
          <div className="flex gap-1 p-[3px] rounded-xl bg-sq-empty overflow-x-auto max-w-full">
            {rooms.map((hall) => {
              const on = current?.id === hall.id;
              // A request at a table in ANOTHER hall must not be missed by a
              // waiter standing in this one.
              const asking = hall.tables.reduce((sum, t) => sum + (waiting.get(t.id) ?? 0), 0);
              return (
                <button
                  key={hall.id}
                  type="button"
                  aria-pressed={on}
                  data-testid={`hall-tab-${hall.id}`}
                  onClick={() => setHallId(hall.id)}
                  className={`whitespace-nowrap min-h-[34px] px-4 rounded-[9px] text-[15px] transition-colors ${
                    on
                      ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,.12)] font-semibold text-sq-text'
                      : 'font-medium text-sq-secondary'
                  }`}
                >
                  {hall.name}
                  {asking > 0 && (
                    <span
                      data-testid={`hall-tab-guest-${hall.id}`}
                      className="ml-1.5 inline-flex items-center gap-0.5 text-sq-blue font-semibold"
                    >
                      <Bell size={14} aria-hidden />
                      {asking}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex-1" />
        {current && <ToneLegend guest={requests.length > 0} />}
      </header>

      {stale && (
        <p
          className="mx-4 md:mx-7 mb-3 rounded-sq bg-amber-50 text-amber-900 px-3 py-2 text-sm"
          data-testid="tables-stale"
        >
          Немає звʼязку — зала з памʼяті каси
          {savedAt == null ? '' : `, станом на ${savedAtLabel(savedAt)}`}
        </p>
      )}

      {banner && (
        <p className="mx-4 md:mx-7 mb-3 rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm" data-testid="tables-banner">
          {banner}
        </p>
      )}

      {note && (
        <p
          className="mx-4 md:mx-7 mb-3 rounded-sq bg-sq-success/10 text-sq-success-ink px-3 py-2 text-sm"
          data-testid="tables-note"
        >
          {note}
        </p>
      )}

      {requests.length > 0 && (
        <section className="mx-4 md:mx-7 mb-3 max-h-[45vh] overflow-auto" data-testid="tables-requests">
          <p className="pb-1.5 text-[13px] font-semibold text-sq-secondary">
            З телефонів гостей · {requestsLabel(requests.length)}
          </p>
          <GuestOrdersPanel
            orders={requests}
            showTable
            busy={busy}
            onAccept={acceptRequest}
            onReject={rejectRequest}
          />
        </section>
      )}

      {loading && rooms.length === 0 && (
        <p className="p-6 text-center text-sm text-sq-muted">Завантаження зали…</p>
      )}

      {!loading && error && (
        <div className="px-4 md:px-7">
          <div className="sq-card p-6 text-center">
            <p className="text-sm">{error}</p>
            <button type="button" className="sq-btn-primary mt-3 px-4 py-2.5" onClick={() => void refresh()}>
              Повторити
            </button>
          </div>
        </div>
      )}

      {!loading && !error && rooms.length === 0 && (
        <div className="px-4 md:px-7">
          <div className="sq-card p-6 text-center" data-testid="tables-empty">
            <p className="text-lg font-semibold">Зали ще не створені</p>
            <p className="mt-1 text-sm text-sq-muted">
              Власник додає зали й столи в адмінці, і вони зʼявляться тут.
            </p>
          </div>
        </div>
      )}

      {current && (
        <div
          className="grid flex-1 content-start gap-3 lg:gap-5 overflow-auto px-4 md:px-7 pt-1 pb-6"
          style={{
            // Cells, not tables: a table spans the owner's width × height of
            // them, so a two-by-two table lands near the board's 200 × 132.
            gridTemplateColumns: `repeat(${extent.cols}, minmax(2.5rem, 1fr))`,
            gridAutoRows: 'minmax(3.75rem, auto)',
          }}
        >
          {seats.map((seat) => (
            <TableTile
              key={seat.table.id}
              seat={seat}
              now={now}
              meId={meId}
              disabled={busy}
              guestWaiting={waiting.get(seat.table.id) ?? 0}
              onOpen={(s) => void open(s)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
