// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Зали і столи» — the owner's floor plan (phase К4i, TechDocs/POS_TABLES.md
// §4.8), at /admin/tables.
//
// The room is laid out by dragging, and saved in grid CELLS. Dragging because
// a floor plan is a picture and typing coordinates into a form is not a way to
// draw one; cells because the same room has to read the same on a laptop, on
// the waiter's tablet and on the till. Tables may overlap — a sofa stands
// against a wall — and nothing here tries to stop that.
//
// The layout is written when the owner LETS GO, in one batch. Not per
// pointer-move: that would be a request every few milliseconds and, on a floor
// with bad Wi-Fi, a half-saved room.
//
// A table is never deleted once anything has been sold at it — the server
// refuses in those words, and the screen offers «Прибрати із зали», which is
// `is_active: false`: the terrace closes for the winter and its bills stay
// readable.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, Plus, Segmented, Table } from '@pos/platform/ui';
import { CELL_PX, changedPositions, droppedAt, editorExtent, cellsMoved, withDroppedTable } from '../lib/layout';
import { useTableDrag } from '../lib/useTableDrag';
import { seatsLabel } from '../lib/hallMap';
import { serverMessage } from '../lib/useHallMap';
import * as tablesApi from '../lib/tablesApi';
import type { PosHall, PosTable, TableShape } from '../lib/types';

interface Draft {
  name: string;
  seats: number;
  width: number;
  height: number;
  shape: TableShape;
}

const NEW_TABLE: Draft = { name: '', seats: 2, width: 2, height: 2, shape: 'rect' };

export function HallEditorPage(): JSX.Element {
  const [halls, setHalls] = useState<PosHall[]>([]);
  const [hallId, setHallId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(NEW_TABLE);
  const [hallName, setHallName] = useState('');

  // Deliberately never clears the banner: a write that was refused reloads
  // the room right after, and clearing here would flash the server's words
  // and take them away before anybody read them. The banner is cleared when
  // the next write starts, and by nothing else.
  const reload = useCallback(async () => {
    try {
      const { halls: rows } = await tablesApi.listHalls();
      setHalls(rows);
    } catch (err) {
      setBanner(serverMessage(err, 'Не вдалося прочитати зали'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const hall = halls.find((h) => h.id === hallId) ?? halls[0] ?? null;
  const tables = useMemo(() => hall?.tables ?? [], [hall]);
  const extent = useMemo(() => editorExtent(tables), [tables]);

  /** Run a write, keep the server's answer, and say its words on a refusal. */
  async function run(write: () => Promise<unknown>): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setBanner(null);
    try {
      await write();
      await reload();
      return true;
    } catch (err) {
      await reload();
      setBanner(serverMessage(err, 'Не вдалося зберегти'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const onDrop = useCallback(
    (id: number, dxPx: number, dyPx: number) => {
      if (!hall) return;
      const table = hall.tables.find((t) => t.id === id);
      if (!table) return;
      const at = droppedAt(table, cellsMoved(dxPx, dyPx));
      const after = withDroppedTable(hall.tables, id, at);
      const positions = changedPositions(hall.tables, after);
      if (positions.length === 0) return;
      // Optimistic, and deliberately so: the tile has to land under the finger
      // that dropped it. The reload that follows the write is what makes the
      // screen agree with the server.
      setHalls((prev) => prev.map((h) => (h.id === hall.id ? { ...h, tables: after } : h)));
      void run(() => tablesApi.moveTables(positions));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hall, busy]
  );

  const { drag, start, suppressClick } = useTableDrag(onDrop);

  function openTable(table: PosTable): void {
    setEditing(table.id);
    setDraft({
      name: table.name,
      seats: table.seats,
      width: table.width,
      height: table.height,
      shape: table.shape,
    });
  }

  async function saveTable(): Promise<void> {
    if (!hall) return;
    const ok = await run(() =>
      editing === 'new'
        ? tablesApi.createTable({ ...draft, hall_id: hall.id, pos_x: 0, pos_y: 0 })
        : tablesApi.updateTable(editing as number, draft)
    );
    if (ok) setEditing(null);
  }

  if (loading) return <p className="p-6 text-center text-sm text-sq-muted">Завантаження…</p>;

  return (
    <div className="animate-fade-up text-sq-text" data-testid="hall-editor">
      <PageHeader
        glyph={Table}
        title="Зали і столи"
        subtitle={hall ? 'Перетягніть стіл, щоб поставити його на місце. Тап — щоб змінити.' : undefined}
        actions={
          hall && (
            <button
              type="button"
              className="pos-btn-primary min-h-11 px-4 rounded-sq text-[15px] gap-1.5"
              data-testid="editor-table-add"
              disabled={busy}
              onClick={() => {
                setEditing('new');
                setDraft(NEW_TABLE);
              }}
            >
              <Plus size={20} />
              Стіл
            </button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {halls.length > 0 && (
          <Segmented
            value={String(hall?.id ?? '')}
            options={halls.map((h) => ({
              value: String(h.id),
              label: `${h.name}${h.is_active ? '' : ' · прибрано'}`,
              testId: `editor-hall-${h.id}`,
            }))}
            onChange={(id) => setHallId(Number(id))}
          />
        )}
        {hall && (
          <button
            type="button"
            className="min-h-11 text-[15px] font-semibold text-sq-blue disabled:opacity-50"
            data-testid="editor-hall-retire"
            disabled={busy}
            onClick={() => void run(() => tablesApi.updateHall(hall.id, { is_active: !hall.is_active }))}
          >
            {hall.is_active ? 'Прибрати залу' : 'Повернути залу'}
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <input
            className="sq-input w-44"
            data-testid="editor-hall-name"
            placeholder="Нова зала"
            value={hallName}
            onChange={(e) => setHallName(e.target.value)}
          />
          <button
            type="button"
            className="sq-btn-quiet whitespace-nowrap"
            data-testid="editor-hall-add"
            disabled={busy || hallName.trim().length === 0}
            onClick={() => {
              const name = hallName.trim();
              setHallName('');
              void run(() => tablesApi.createHall(name));
            }}
          >
            Додати залу
          </button>
        </div>
      </div>

      {banner && (
        <p className="mb-4 rounded-sq bg-red-50 text-red-700 px-3.5 py-2.5 text-sm" data-testid="editor-banner">
          {banner}
        </p>
      )}

      {!hall && (
        <div className="py-14 text-center" data-testid="editor-empty">
          <Table size={48} className="mx-auto" />
          <p className="mt-3 text-[17px] font-semibold text-sq-heading">Залів ще немає</p>
          <p className="mt-1 text-[15px] text-sq-secondary">
            Додайте залу — і перетягніть у неї столи так, як вони стоять насправді.
          </p>
        </div>
      )}

      {hall && (
        <div
          className="relative overflow-auto rounded-card bg-sq-sidebar p-3"
          data-testid="editor-grid"
          style={{
            // The plan itself is a grid of cells; the tiles sit on it by
            // `gridColumn`/`gridRow`, which is how the stored numbers and
            // the picture stay the same thing.
            display: 'grid',
            gridTemplateColumns: `repeat(${extent.cols}, ${CELL_PX}px)`,
            gridAutoRows: `${CELL_PX}px`,
            gap: '4px',
          }}
        >
          {tables.map((table) => {
            const dragging = drag.id === table.id;
            return (
              <button
                key={table.id}
                type="button"
                data-testid={`editor-table-${table.id}`}
                data-dragging={dragging ? 'yes' : 'no'}
                onPointerDown={(e) => start(e, table.id)}
                onClick={(e) => {
                  // A drag ends with a click the browser sends anyway; the
                  // form must not open on top of the table just dropped.
                  if (suppressClick()) {
                    e.preventDefault();
                    return;
                  }
                  openTable(table);
                }}
                className={`flex flex-col items-center justify-center gap-0.5 p-2 text-center transition-shadow ${
                  table.shape === 'round' ? 'rounded-full' : 'rounded-card'
                } ${
                  !table.is_active
                    ? 'bg-sq-empty opacity-60'
                    : dragging || (editing === table.id)
                      ? 'bg-white ring-2 ring-sq-blue shadow-card-hover'
                      : 'bg-white ring-1 ring-sq-divider shadow-card'
                }`}
                style={{
                  gridColumn: `${table.pos_x + 1} / span ${table.width}`,
                  gridRow: `${table.pos_y + 1} / span ${table.height}`,
                  touchAction: 'none',
                  transform: dragging ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
                  zIndex: dragging ? 10 : undefined,
                }}
              >
                <span className="text-[26px] font-bold leading-none text-sq-heading tabular-nums">
                  {table.name}
                </span>
                <span className="text-[13px] text-sq-muted">{seatsLabel(table.seats)}</span>
              </button>
            );
          })}
        </div>
      )}

      {editing != null && (
        <div className="sq-card mt-5 p-5" data-testid="editor-form">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-sq-secondary">Назва</span>
              <input
                className="sq-input w-28"
                data-testid="editor-form-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-sq-secondary">Місць</span>
              <input
                className="sq-input w-24 tabular-nums"
                type="number"
                min={1}
                data-testid="editor-form-seats"
                value={draft.seats}
                onChange={(e) => setDraft({ ...draft, seats: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-sq-secondary">Ширина</span>
              <input
                className="sq-input w-24 tabular-nums"
                type="number"
                min={1}
                data-testid="editor-form-width"
                value={draft.width}
                onChange={(e) => setDraft({ ...draft, width: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-sq-secondary">Висота</span>
              <input
                className="sq-input w-24 tabular-nums"
                type="number"
                min={1}
                data-testid="editor-form-height"
                value={draft.height}
                onChange={(e) => setDraft({ ...draft, height: Number(e.target.value) })}
              />
            </label>
            <button
              type="button"
              data-testid="editor-form-shape"
              className="sq-btn-quiet"
              onClick={() =>
                setDraft({ ...draft, shape: draft.shape === 'rect' ? 'round' : 'rect' })
              }
            >
              {draft.shape === 'rect' ? 'Прямокутний' : 'Круглий'}
            </button>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="pos-btn-primary min-h-11 px-4 rounded-sq text-[15px]"
              data-testid="editor-form-save"
              disabled={busy || draft.name.trim().length === 0}
              onClick={() => void saveTable()}
            >
              Зберегти
            </button>
            <button type="button" className="sq-btn-quiet" onClick={() => setEditing(null)}>
              Скасувати
            </button>
            {editing !== 'new' && (
              <button
                type="button"
                className="ml-auto min-h-11 text-[15px] text-red-600 font-semibold disabled:opacity-50"
                data-testid="editor-form-retire"
                disabled={busy}
                onClick={async () => {
                  // Retire, never delete: what was sold at this table has to
                  // stay readable. The server refuses a delete in those words
                  // anyway, and hearing it as an error would be worse.
                  const ok = await run(() =>
                    tablesApi.updateTable(editing as number, { is_active: false })
                  );
                  if (ok) setEditing(null);
                }}
              >
                Прибрати із зали
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
