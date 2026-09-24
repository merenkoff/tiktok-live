// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The bill of one table (phases К4f, К4l — TechDocs/POS_TABLES.md §3.2).
//
// The table's workstation: the menu on one side, the bill on the other. A
// tap on a tile puts the dish on the draft at once (§4.13), a tap on «На
// кухню» sends it. On a wide screen the two sit side by side; on a narrow
// one the menu takes the screen and the bill lives on a bar beneath it,
// opening as a sheet — the till's own phone layout.
//
// The one thing this screen must never blur is which of its two sums is
// money:
//
//   «До сплати» is what the rounds LOCKED when they fired. Real.
//   «Чернетка»  is what the untyped half would come to TODAY. Not owed.
//
// Adding them into one figure would be the very thing §4.3 forbids — a bill
// that quietly reprices itself mid-dinner. So they are two lines, named apart,
// and the draft one carries «≈» whenever any of its lines cannot be priced yet.
//
// «На кухню» is the only button that changes the world: it locks the prices,
// moves the stock and puts the ticket on the pass. It carries a `client_uuid`
// so a second tap on a bad connection is the same round, not dinner twice.

import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DEFAULT_RECEIPT_PAPER_WIDTH,
  getMeta,
  printPrecheck,
  useAuthStore,
  useOfflineStatus,
  usePosShell,
  useVertical,
} from '@pos/platform';
import type { CatalogItem, ReceiptPaperWidth } from '@pos/platform';
import { ArrowLeft, ModifierSheet } from '@pos/platform/ui';
import { BillBar } from '../components/BillBar';
import { BillPane } from '../components/BillPane';
import { BillSheet } from '../components/BillSheet';
import { MenuCatalog } from '../components/MenuCatalog';
import { PaySheet } from '../components/PaySheet';
import { countsByProduct, draftSummary, draftView } from '../lib/draft';
import type { DraftLineView } from '../lib/draft';
import { isSettled, payableLines } from '../lib/pay';
import { buildPrecheck } from '../lib/precheck';
import { useBill } from '../lib/useBill';
import { useIsWide } from '../lib/useIsWide';
import { guestsLabel, seatedFor } from '../lib/hallMap';
import * as tablesApi from '../lib/tablesApi';
import type { PayPart } from '../lib/tablesApi';

function newUuid(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (c?.randomUUID) return c.randomUUID();
  // Only a very old webview lands here; the value still has to look like one,
  // because the server validates the shape before it dedupes on it.
  return '00000000-0000-4000-8000-' + String(Date.now()).padStart(12, '0').slice(-12);
}

export function BillPage(): JSX.Element {
  const { billId } = useParams<{ billId: string }>();
  const id = Number(billId);
  const online = useOfflineStatus((s) => s.online);
  const shell = usePosShell();
  const storeId = useAuthStore((s) => s.auth?.store.id ?? null);
  const {
    bill,
    loading,
    error,
    banner,
    busy,
    pending,
    epoch,
    stale,
    savedAt,
    clearBanner,
    notice,
    reload,
    addLine,
    run,
  } = useBill(
    id,
    // The till and the tablet PWA keep a copy so a blink of the Wi-Fi does not
    // take the bill off the screen mid-dinner; the web shell has no offline
    // runtime to read one back (§4.12).
    { online, mirrored: shell !== 'web', storeId }
  );
  const wide = useIsWide();
  const vertical = useVertical();
  const sizeLabel = vertical.attributes.find((a) => a.key === 'size')?.label ?? 'Розмір';
  const [sheetOpen, setSheetOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  // The draft row being retyped on the sheet, with the product's variants
  // looked up in the menu's own rows (К4m).
  const [editing, setEditing] = useState<{ row: DraftLineView; variants: CatalogItem[] } | null>(null);
  const [printStatus, setPrintStatus] = useState<string | null>(null);
  const navigate = useNavigate();

  const draft = useMemo(() => (bill ? draftView(bill.draft, pending) : []), [bill, pending]);
  const summary = useMemo(() => draftSummary(draft), [draft]);
  const owedLines = useMemo(() => (bill ? payableLines(bill) : []), [bill]);
  // The count on each tile needs the catalog's own grouping, which lives in
  // the menu; the menu hands its rows up through this and reads the counts back.
  const [grouped, setGrouped] = useState<ReadonlyArray<readonly [number, readonly CatalogItem[]]>>([]);
  const counts = useMemo(() => countsByProduct(draft, grouped), [draft, grouped]);

  // Offline with nothing remembered. With a mirror the bill is drawn below
  // instead — readable, marked as a memory, and with every write refused.
  if (!online && !stale && !loading) {
    return (
      <div className="p-4" data-testid="bill-offline">
        <div className="sq-card p-6 text-center">
          <p className="text-lg font-semibold">Потрібна мережа</p>
          <p className="mt-1 text-sm text-sq-muted">
            Рахунок живе на сервері — без звʼязку його не змінити.
          </p>
        </div>
      </div>
    );
  }

  if (loading) return <p className="p-6 text-center text-sm text-sq-muted">Завантаження…</p>;

  if (error || !bill) {
    return (
      <div className="p-4">
        <div className="sq-card p-6 text-center">
          <p className="text-sm">{error ?? 'Рахунок не знайдено'}</p>
          <button type="button" className="sq-btn-primary mt-3" onClick={() => void reload()}>
            Повторити
          </button>
        </div>
      </div>
    );
  }

  /**
   * Pay, then leave if the table is settled.
   *
   * Whether it IS settled is read off the bill the server answered with, not
   * guessed from what was sent: a part may fail after an earlier one was
   * rung, and the lines still without a `sale_id` are the only honest answer
   * to «що лишилось».
   */
  const pay = async (parts: PayPart[]): Promise<void> => {
    let settled = false;
    const ok = await run(async () => {
      const paid = await tablesApi.payBill(bill.id, parts);
      settled = isSettled(paid.bill);
      return paid.bill;
    }, { stock: true });
    if (!ok) return;
    setPaying(false);
    if (settled) navigate('/tables');
  };

  /**
   * The pre-bill: mark it on the server, and on a till also print it.
   *
   * The mark is the part that matters to everyone else — it is what the
   * table's tile shows, so the next waiter does not read the sum out twice —
   * so it is recorded first and never held up by paper. The waiter's tablet
   * has no printer at all; there the mark IS the whole action, and К4h's
   * Rust command simply never runs.
   */
  const precheck = async (): Promise<void> => {
    setPrintStatus(null);
    const ok = await run(() => tablesApi.markPrecheck(bill.id));
    if (!ok || shell !== 'cashier') return;
    try {
      const [name, mm] = await Promise.all([
        getMeta<string>('receiptPrinterName'),
        getMeta<ReceiptPaperWidth>('receiptPaperWidthMm'),
      ]);
      if (!name) return; // a till with no thermal printer configured
      await printPrecheck(
        name,
        buildPrecheck(bill),
        mm === 58 || mm === 80 ? mm : DEFAULT_RECEIPT_PAPER_WIDTH
      );
      setPrintStatus('Передчек надіслано на друк');
    } catch (err) {
      setPrintStatus(err instanceof Error ? err.message : 'Не вдалося надрукувати');
    }
  };

  const fire = (): void => {
    setSheetOpen(false);
    void run(() => tablesApi.fireRound(bill.id, newUuid()), { stock: true });
  };

  const less = (row: DraftLineView): void => {
    if (row.id == null) return;
    const lineId = row.id;
    void run(() =>
      row.quantity > 1 ? tablesApi.setQuantity(bill.id, lineId, row.quantity - 1) : tablesApi.removeLine(bill.id, lineId)
    );
  };

  const more = (row: DraftLineView): void => {
    if (row.id == null) return;
    const lineId = row.id;
    void run(() => tablesApi.setQuantity(bill.id, lineId, row.quantity + 1));
  };

  /**
   * Open the sheet on a draft row — its answers, its note, its size — and
   * send the result as one PATCH. The product's variants come from the menu
   * the page already has; a dish the menu no longer lists cannot be retyped,
   * only taken off, and the bill says so instead of opening an empty sheet.
   */
  const edit = (row: DraftLineView): void => {
    if (row.id == null) return;
    const group = grouped.find(([, items]) => items.some((i) => i.variant_id === row.variant_id));
    if (!group) {
      notice('Страви вже немає в меню — зніміть рядок і додайте іншу');
      return;
    }
    setEditing({ row, variants: [...group[1]] });
  };

  const saveEdit = (item: CatalogItem, modifiers: number[], note: string): void => {
    const lineId = editing?.row.id;
    setEditing(null);
    if (lineId == null) return;
    void run(() => tablesApi.updateLine(bill.id, lineId, { variant_id: item.variant_id, modifiers, note }));
  };

  const pane = (
    <BillPane
      bill={bill}
      draft={draft}
      summary={summary}
      owedCents={bill.fired_total_cents}
      busy={busy}
      online={online}
      hasPending={pending.length > 0}
      canPay={owedLines.length > 0}
      canPrecheck={owedLines.length > 0}
      printStatus={printStatus}
      onLess={less}
      onMore={more}
      onEdit={edit}
      onCancelRound={(roundId) => void run(() => tablesApi.cancelRound(bill.id, roundId), { stock: true })}
      onFire={fire}
      onPay={() => {
        setSheetOpen(false);
        setPaying(true);
      }}
      onPrecheck={() => void precheck()}
    />
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col" data-testid="bill-page">
      <header className="flex shrink-0 items-center gap-3.5 px-4 md:px-6 min-h-[68px] py-2 shadow-[0_1px_0_#E6E8EC]">
        <button
          type="button"
          className="shrink-0 min-h-11 -ml-1 pr-1 inline-flex items-center gap-1 text-[15px] font-semibold text-sq-blue"
          onClick={() => navigate('/tables')}
        >
          <ArrowLeft size={20} />
          {bill.hall_name || 'Зала'}
        </button>
        <div className={`min-w-0 flex-1 ${wide ? '' : 'text-center pr-16'}`}>
          <p className="truncate text-xl font-bold text-sq-heading">Стіл {bill.table_name}</p>
          <p className="truncate text-[13px] text-sq-muted">
            {guestsLabel(bill.guests)} · {bill.opened_by_name} · {seatedFor(bill.opened_at, new Date().toISOString())} ·
            рахунок {bill.bill_no}
          </p>
        </div>
      </header>

      {stale && (
        <p className="mx-4 md:mx-6 mt-2 rounded-sq bg-amber-50 text-amber-900 px-3 py-2 text-sm" data-testid="bill-stale">
          Немає звʼязку — рахунок з памʼяті каси
          {savedAt == null
            ? ''
            : `, станом на ${String(new Date(savedAt).getHours()).padStart(2, '0')}:${String(
                new Date(savedAt).getMinutes()
              ).padStart(2, '0')}`}
          . Змінити його можна лише онлайн.
        </p>
      )}

      {banner && (
        <p className="mx-4 md:mx-6 mt-2 rounded-sq bg-red-50 text-red-700 px-3 py-2 text-sm" data-testid="bill-banner">
          {banner}{' '}
          <button type="button" className="sq-link" onClick={clearBanner}>
            Зрозуміло
          </button>
        </p>
      )}

      <div className={`min-h-0 flex-1 ${wide ? 'grid grid-cols-[minmax(0,1fr)_372px]' : 'flex flex-col'}`}>
        <MenuCatalog
          counts={counts}
          online={online}
          active={online && !paying && !sheetOpen && !editing}
          canScan={shell === 'cashier'}
          epoch={epoch}
          onAdd={addLine}
          onRows={setGrouped}
        />
        {wide && (
          <aside className="flex min-h-0 flex-col bg-sq-sidebar shadow-[-1px_0_0_#E6E8EC]">{pane}</aside>
        )}
      </div>

      {!wide && (
        <BillBar
          draft={draft}
          rounds={bill.rounds}
          summary={summary}
          owedCents={bill.fired_total_cents}
          hasPending={pending.length > 0}
          busy={busy}
          online={online}
          onOpen={() => setSheetOpen(true)}
          onFire={fire}
        />
      )}

      {!wide && sheetOpen && (
        <BillSheet title={`Стіл ${bill.table_name} · рахунок ${bill.bill_no}`} onClose={() => setSheetOpen(false)}>
          {pane}
        </BillSheet>
      )}

      {paying && (
        <PaySheet bill={bill} busy={busy} onClose={() => setPaying(false)} onPay={(p) => void pay(p)} />
      )}

      {editing && (
        // Over everything, the bill sheet included: the modifier sheet
        // positions itself `absolute` inside whatever it is given.
        <div className="fixed inset-0 z-50">
          <ModifierSheet
            productName={editing.row.product_name}
            variants={editing.variants}
            variantLabel={sizeLabel}
            initialVariantId={editing.row.variant_id}
            initialModifierIds={editing.row.modifierIds}
            initialNote={editing.row.note}
            submitLabel="Зберегти"
            withQuantity={false}
            onAdd={({ item, modifiers, note }) => saveEdit(item, modifiers, note)}
            onClose={() => setEditing(null)}
          />
        </div>
      )}
    </div>
  );
}
