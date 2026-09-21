// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/tables.service.ts — the room: halls and the tables in them
// (phase К4a; migration 052, TechDocs/POS_TABLES.md §8.1, §10).
//
// This file owns the furniture only. The bill that sits on a table, the
// rounds fired from it and the payment that closes it are К4b–К4d; migration
// 052 creates their tables in one go because their foreign keys are one
// graph, but nothing here reads them except to refuse a delete.
//
// Two rules are the whole of it:
//
// 1. **Retiring beats deleting.** A table some bill once sat at cannot be
//    removed — `pos_bills.table_id` is ON DELETE RESTRICT, and it is on
//    purpose: erasing the table would erase the history behind a sale. So
//    `deleteTable` refuses in words and points at `is_active = false`, rather
//    than letting Postgres raise a foreign-key error the till would show as a
//    500. Same for a hall, whose tables cascade with it.
// 2. **Positions are written in one batch.** The owner drags a table across
//    the room and lets go; the editor sends every moved table at once
//    (`moveTables`), in one transaction. N separate PATCHes mid-drag is the
//    anti-pattern §6 of the design doc is against.
//
// Coordinates are whole grid CELLS, never pixels (§4.8): the owner lays the
// room out on a laptop and the waiter reads it on a tablet. Overlap is not an
// error — a sofa stands against a wall — so nothing validates it.

import { pool } from '../db.js';

export class TablesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TablesError';
  }
}

/** The hall or table is not this store's, or does not exist at all. */
export class TablesNotFound extends TablesError {
  constructor(message: string) {
    super(message);
    this.name = 'TablesNotFound';
  }
}

/** A delete that would take history with it, or a name already taken. */
export class TablesConflict extends TablesError {
  constructor(message: string) {
    super(message);
    this.name = 'TablesConflict';
  }
}

export const TABLE_SHAPES = ['rect', 'round'] as const;
export type TableShape = (typeof TABLE_SHAPES)[number];

export interface PosTable {
  id: number;
  store_id: number;
  hall_id: number;
  name: string;
  seats: number;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  shape: TableShape;
  is_active: boolean;
}

export interface PosHall {
  id: number;
  store_id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
  tables: PosTable[];
}

export interface HallInput {
  name?: unknown;
  sort_order?: unknown;
  is_active?: unknown;
}

export interface TableInput {
  hall_id?: unknown;
  name?: unknown;
  seats?: unknown;
  pos_x?: unknown;
  pos_y?: unknown;
  width?: unknown;
  height?: unknown;
  shape?: unknown;
  is_active?: unknown;
}

export interface TablePosition {
  id: number;
  hall_id?: number;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
}

const MAX_NAME = 60;
/** A room bigger than this is a drawing, not a floor plan. */
const MAX_CELL = 200;

function mapHall(row: Record<string, unknown>): PosHall {
  return {
    id: Number(row.id),
    store_id: Number(row.store_id),
    name: String(row.name),
    sort_order: Number(row.sort_order),
    is_active: Boolean(row.is_active),
    tables: [],
  };
}

function mapTable(row: Record<string, unknown>): PosTable {
  return {
    id: Number(row.id),
    store_id: Number(row.store_id),
    hall_id: Number(row.hall_id),
    name: String(row.name),
    seats: Number(row.seats),
    pos_x: Number(row.pos_x),
    pos_y: Number(row.pos_y),
    width: Number(row.width),
    height: Number(row.height),
    shape: row.shape === 'round' ? 'round' : 'rect',
    is_active: Boolean(row.is_active),
  };
}

function cleanName(value: unknown, what: string): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) throw new TablesError(`${what} потребує назви`);
  if (name.length > MAX_NAME) throw new TablesError(`Назва задовга (до ${MAX_NAME} символів)`);
  return name;
}

function cleanCell(value: unknown, what: string, min: number): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > MAX_CELL) {
    throw new TablesError(`${what} має бути цілим числом від ${min} до ${MAX_CELL}`);
  }
  return n;
}

function cleanShape(value: unknown): TableShape {
  if (value == null) return 'rect';
  if (!(TABLE_SHAPES as readonly unknown[]).includes(value)) {
    throw new TablesError('Форма столу має бути rect або round');
  }
  return value as TableShape;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === '23505';
}

/**
 * The hall map: every hall of the store with its tables, active first.
 *
 * Deliberately not gated on «the store has halls»: a store that has none is
 * exactly the store whose owner is about to create the first one, and a list
 * that answers 409 to an empty room is a dead end. The endpoints that need a
 * room to exist are the bill ones (К4b).
 */
export async function listHalls(storeId: number): Promise<PosHall[]> {
  const hallRows = await pool.query(
    `SELECT * FROM pos_halls
      WHERE store_id = $1
      ORDER BY is_active DESC, sort_order ASC, id ASC`,
    [storeId]
  );
  const halls = hallRows.rows.map(mapHall);
  if (halls.length === 0) return halls;

  const tableRows = await pool.query(
    `SELECT * FROM pos_tables
      WHERE store_id = $1
      ORDER BY is_active DESC, pos_y ASC, pos_x ASC, id ASC`,
    [storeId]
  );
  const byHall = new Map<number, PosTable[]>();
  for (const row of tableRows.rows) {
    const table = mapTable(row);
    const list = byHall.get(table.hall_id) ?? [];
    list.push(table);
    byHall.set(table.hall_id, list);
  }
  for (const hall of halls) hall.tables = byHall.get(hall.id) ?? [];
  return halls;
}

export async function createHall(storeId: number, input: HallInput): Promise<PosHall> {
  const name = cleanName(input.name, 'Зал');
  const result = await pool.query(
    `INSERT INTO pos_halls (store_id, name, sort_order, is_active)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [storeId, name, Number(input.sort_order) || 0, input.is_active !== false]
  );
  return mapHall(result.rows[0]);
}

export async function updateHall(
  storeId: number,
  hallId: number,
  input: HallInput
): Promise<PosHall> {
  const sets: string[] = [];
  const values: unknown[] = [storeId, hallId];
  if (input.name !== undefined) {
    values.push(cleanName(input.name, 'Зал'));
    sets.push(`name = $${values.length}`);
  }
  if (input.sort_order !== undefined) {
    values.push(Number(input.sort_order) || 0);
    sets.push(`sort_order = $${values.length}`);
  }
  if (input.is_active !== undefined) {
    values.push(Boolean(input.is_active));
    sets.push(`is_active = $${values.length}`);
  }
  if (sets.length === 0) {
    const current = await pool.query(`SELECT * FROM pos_halls WHERE store_id = $1 AND id = $2`, [
      storeId,
      hallId,
    ]);
    if (current.rowCount === 0) throw new TablesNotFound('Зал не знайдено');
    return mapHall(current.rows[0]);
  }
  sets.push('updated_at = NOW()');
  const result = await pool.query(
    `UPDATE pos_halls SET ${sets.join(', ')} WHERE store_id = $1 AND id = $2 RETURNING *`,
    values
  );
  if (result.rowCount === 0) throw new TablesNotFound('Зал не знайдено');
  return mapHall(result.rows[0]);
}

/**
 * Remove a hall and its tables — but only while no bill has ever sat at one
 * of them. Otherwise the answer is the truth: turn it off instead, so the
 * evening it hosted stays readable.
 */
export async function deleteHall(storeId: number, hallId: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hall = await client.query(
      `SELECT id FROM pos_halls WHERE store_id = $1 AND id = $2 FOR UPDATE`,
      [storeId, hallId]
    );
    if (hall.rowCount === 0) throw new TablesNotFound('Зал не знайдено');
    const used = await client.query(
      `SELECT 1 FROM pos_bills b
         JOIN pos_tables t ON t.id = b.table_id
        WHERE t.hall_id = $1
        LIMIT 1`,
      [hallId]
    );
    if (used.rowCount && used.rowCount > 0) {
      throw new TablesConflict(
        'У залі є столи з рахунками — його не можна видалити. Вимкніть зал замість видалення.'
      );
    }
    await client.query(`DELETE FROM pos_halls WHERE store_id = $1 AND id = $2`, [storeId, hallId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createTable(storeId: number, input: TableInput): Promise<PosTable> {
  const hallId = Number(input.hall_id);
  if (!Number.isInteger(hallId) || hallId <= 0) throw new TablesNotFound('Зал не знайдено');
  const hall = await pool.query(`SELECT id FROM pos_halls WHERE store_id = $1 AND id = $2`, [
    storeId,
    hallId,
  ]);
  if (hall.rowCount === 0) throw new TablesNotFound('Зал не знайдено');

  const name = cleanName(input.name, 'Стіл');
  const seats = input.seats === undefined ? 2 : cleanCell(input.seats, 'Кількість місць', 1);
  const posX = input.pos_x === undefined ? 0 : cleanCell(input.pos_x, 'Координата X', 0);
  const posY = input.pos_y === undefined ? 0 : cleanCell(input.pos_y, 'Координата Y', 0);
  const width = input.width === undefined ? 2 : cleanCell(input.width, 'Ширина', 1);
  const height = input.height === undefined ? 2 : cleanCell(input.height, 'Висота', 1);

  try {
    const result = await pool.query(
      `INSERT INTO pos_tables
         (store_id, hall_id, name, seats, pos_x, pos_y, width, height, shape, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        storeId,
        hallId,
        name,
        seats,
        posX,
        posY,
        width,
        height,
        cleanShape(input.shape),
        input.is_active !== false,
      ]
    );
    return mapTable(result.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) throw new TablesConflict(`Стіл «${name}» уже є`);
    throw error;
  }
}

export async function updateTable(
  storeId: number,
  tableId: number,
  input: TableInput
): Promise<PosTable> {
  const sets: string[] = [];
  const values: unknown[] = [storeId, tableId];
  const push = (fragment: string, value: unknown): void => {
    values.push(value);
    sets.push(`${fragment} = $${values.length}`);
  };

  if (input.hall_id !== undefined) {
    const hallId = Number(input.hall_id);
    if (!Number.isInteger(hallId) || hallId <= 0) throw new TablesNotFound('Зал не знайдено');
    const hall = await pool.query(`SELECT id FROM pos_halls WHERE store_id = $1 AND id = $2`, [
      storeId,
      hallId,
    ]);
    if (hall.rowCount === 0) throw new TablesNotFound('Зал не знайдено');
    push('hall_id', hallId);
  }
  if (input.name !== undefined) push('name', cleanName(input.name, 'Стіл'));
  if (input.seats !== undefined) push('seats', cleanCell(input.seats, 'Кількість місць', 1));
  if (input.pos_x !== undefined) push('pos_x', cleanCell(input.pos_x, 'Координата X', 0));
  if (input.pos_y !== undefined) push('pos_y', cleanCell(input.pos_y, 'Координата Y', 0));
  if (input.width !== undefined) push('width', cleanCell(input.width, 'Ширина', 1));
  if (input.height !== undefined) push('height', cleanCell(input.height, 'Висота', 1));
  if (input.shape !== undefined) push('shape', cleanShape(input.shape));
  if (input.is_active !== undefined) push('is_active', Boolean(input.is_active));

  if (sets.length === 0) {
    const current = await pool.query(`SELECT * FROM pos_tables WHERE store_id = $1 AND id = $2`, [
      storeId,
      tableId,
    ]);
    if (current.rowCount === 0) throw new TablesNotFound('Стіл не знайдено');
    return mapTable(current.rows[0]);
  }
  sets.push('updated_at = NOW()');
  try {
    const result = await pool.query(
      `UPDATE pos_tables SET ${sets.join(', ')} WHERE store_id = $1 AND id = $2 RETURNING *`,
      values
    );
    if (result.rowCount === 0) throw new TablesNotFound('Стіл не знайдено');
    return mapTable(result.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) throw new TablesConflict('Стіл із такою назвою вже є');
    throw error;
  }
}

/** Same rule as `deleteHall`: a table a bill sat at is retired, never removed. */
export async function deleteTable(storeId: number, tableId: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const table = await client.query(
      `SELECT id FROM pos_tables WHERE store_id = $1 AND id = $2 FOR UPDATE`,
      [storeId, tableId]
    );
    if (table.rowCount === 0) throw new TablesNotFound('Стіл не знайдено');
    const used = await client.query(`SELECT 1 FROM pos_bills WHERE table_id = $1 LIMIT 1`, [
      tableId,
    ]);
    if (used.rowCount && used.rowCount > 0) {
      throw new TablesConflict(
        'На столі були рахунки — його не можна видалити. Вимкніть стіл замість видалення.'
      );
    }
    await client.query(`DELETE FROM pos_tables WHERE store_id = $1 AND id = $2`, [
      storeId,
      tableId,
    ]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Write the layout the owner just dragged into place — every moved table in
 * one transaction, so the room is never half-saved. A table id this store
 * does not own fails the whole batch rather than being skipped: a partial
 * save the editor cannot see is worse than a refusal it can.
 */
export async function moveTables(
  storeId: number,
  positions: readonly TablePosition[]
): Promise<PosTable[]> {
  if (positions.length === 0) return [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const moved: PosTable[] = [];
    for (const position of positions) {
      const values: unknown[] = [
        storeId,
        position.id,
        cleanCell(position.pos_x, 'Координата X', 0),
        cleanCell(position.pos_y, 'Координата Y', 0),
        cleanCell(position.width, 'Ширина', 1),
        cleanCell(position.height, 'Висота', 1),
      ];
      let hallFragment = '';
      if (position.hall_id !== undefined) {
        const hall = await client.query(
          `SELECT id FROM pos_halls WHERE store_id = $1 AND id = $2`,
          [storeId, position.hall_id]
        );
        if (hall.rowCount === 0) throw new TablesNotFound('Зал не знайдено');
        values.push(position.hall_id);
        hallFragment = `, hall_id = $${values.length}`;
      }
      const result = await client.query(
        `UPDATE pos_tables
            SET pos_x = $3, pos_y = $4, width = $5, height = $6${hallFragment},
                updated_at = NOW()
          WHERE store_id = $1 AND id = $2
        RETURNING *`,
        values
      );
      if (result.rowCount === 0) throw new TablesNotFound('Стіл не знайдено');
      moved.push(mapTable(result.rows[0]));
    }
    await client.query('COMMIT');
    return moved;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
