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
import { CELL_PX, changedPositions, droppedAt, editorExtent, cellsMoved, withDroppedTable } from '../lib/layout';
import { useTableDrag } from '../lib/useTableDrag';
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
    <div className="p-4" data-testid="hall-editor">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {halls.map((h) => (
          <button
            key={h.id}
            type="button"
            data-testid={`editor-hall-${h.id}`}
            onClick={() => setHallId(h.id)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              hall?.id === h.id
                ? 'border-sq-blue bg-sq-blue text-white'
                : 'border-sq-divider bg-sq-surface text-sq-text'
            }`}
          >
            {h.name}
            {h.is_active ? '' : ' · прибрано'}
          </button>
        ))}
        <input
          className="sq-field w-40"
          data-testid="editor-hall-name"
          placeholder="Нова зала"
          value={hallName}
          onChange={(e) => setHallName(e.target.value)}
        />
        <button
          type="button"
          className="sq-btn-primary"
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

      {banner && (
        <p className="mb-3 rounded-lg bg-rose-500/15 p-2 text-sm" data-testid="editor-banner">
          {banner}
        </p>
      )}

      {!hall && (
        <div className="sq-card p-6 text-center" data-testid="editor-empty">
          <p className="text-lg font-semibold">Залів ще немає</p>
          <p className="mt-1 text-sm text-sq-muted">
            Додайте залу — і перетягніть у неї столи так, як вони стоять насправді.
          </p>
        </div>
      )}

      {hall && (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="sq-btn-primary"
              data-testid="editor-table-add"
              disabled={busy}
              onClick={() => {
                setEditing('new');
                setDraft(NEW_TABLE);
              }}
            >
              + Стіл
            </button>
            <button
              type="button"
              className="sq-link"
              data-testid="editor-hall-retire"
              disabled={busy}
              onClick={() => void run(() => tablesApi.updateHall(hall.id, { is_active: !hall.is_active }))}
            >
              {hall.is_active ? 'Прибрати залу' : 'Повернути залу'}
            </button>
            <span className="text-xs text-sq-muted">
              Перетягніть стіл, щоб поставити його на місце. Тап — щоб змінити.
            </span>
          </div>

          <div
            className="relative overflow-auto rounded-sq border border-sq-divider bg-sq-surface p-2"
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
                  className={`flex flex-col items-center justify-center border-2 text-center ${
                    table.shape === 'round' ? 'rounded-full' : 'rounded-sq'
                  } ${table.is_active ? 'border-sq-blue bg-sq-blue/10' : 'border-sq-divider opacity-60'}`}
                  style={{
                    gridColumn: `${table.pos_x + 1} / span ${table.width}`,
                    gridRow: `${table.pos_y + 1} / span ${table.height}`,
                    touchAction: 'none',
                    transform: dragging ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
                    zIndex: dragging ? 10 : undefined,
                  }}
                >
                  <span className="text-lg font-bold">{table.name}</span>
                  <span className="text-xs text-sq-muted">{table.seats} місць</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {editing != null && (
        <div className="sq-card mt-3 p-3" data-testid="editor-form">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-sq-muted">
              Назва
              <input
                className="sq-field mt-1 block w-24"
                data-testid="editor-form-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label className="text-xs text-sq-muted">
              Місць
              <input
                className="sq-field mt-1 block w-20"
                type="number"
                min={1}
                data-testid="editor-form-seats"
                value={draft.seats}
                onChange={(e) => setDraft({ ...draft, seats: Number(e.target.value) })}
              />
            </label>
            <label className="text-xs text-sq-muted">
              Ширина
              <input
                className="sq-field mt-1 block w-20"
                type="number"
                min={1}
                data-testid="editor-form-width"
                value={draft.width}
                onChange={(e) => setDraft({ ...draft, width: Number(e.target.value) })}
              />
            </label>
            <label className="text-xs text-sq-muted">
              Висота
              <input
                className="sq-field mt-1 block w-20"
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
              className="rounded-lg border border-sq-divider px-3 py-2 text-sm"
              onClick={() =>
                setDraft({ ...draft, shape: draft.shape === 'rect' ? 'round' : 'rect' })
              }
            >
              {draft.shape === 'rect' ? 'Прямокутний' : 'Круглий'}
            </button>
            <button
              type="button"
              className="sq-btn-primary"
              data-testid="editor-form-save"
              disabled={busy || draft.name.trim().length === 0}
              onClick={() => void saveTable()}
            >
              Зберегти
            </button>
            {editing !== 'new' && (
              <button
                type="button"
                className="sq-link"
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
            <button type="button" className="sq-link" onClick={() => setEditing(null)}>
              Скасувати
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
