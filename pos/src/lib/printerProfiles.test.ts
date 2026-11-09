// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// Shared printer profiles on the till (TechDocs/POS_PRINTER_PROFILES.md): the
// owner's own pick wins, an approved profile for the driver comes next, the
// third document printed with an own pick reports it — once.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

vi.mock('../services/api', () => ({ api: { posRequest: vi.fn() } }));

import { api } from '../services/api';
import { db } from '../offline/db';
import { printReceipt, savePrinterEncoding, type ReceiptData } from './printer';
import {
  chooseEncoding,
  forgetOwnEncoding,
  notePrinted,
  refreshSharedProfiles,
  resetPrinterProfilesForTests,
  resolvePrinterEncoding,
  sharedFor,
} from './printerProfiles';

const XP = { driver: 'XP-58', title: 'Xprinter XP-58IIH', table: 'cp866' as const, esc_t: 17 };
const posRequest = vi.mocked(api.posRequest);

function printersAre(list: Array<{ name: string; driver: string }>) {
  vi.mocked(invoke).mockImplementation(async (cmd: string) =>
    cmd === 'list_printers' ? list.map((p) => ({ ...p, is_default: false })) : undefined
  );
}

const reports = () => posRequest.mock.calls.filter(([method, path]) => method === 'post' && path === '/printer-profiles/report');

beforeEach(async () => {
  resetPrinterProfilesForTests();
  await db.meta.clear();
  posRequest.mockReset();
  vi.mocked(invoke).mockReset();
  printersAre([{ name: 'Каса', driver: ' XP-58 ' }]);
});

describe('choosing a profile', () => {
  it('the own pick wins, then the approved one, then the default', () => {
    expect(chooseEncoding({ table: 'cp1125', esc_t: 3 }, XP)).toEqual({ encoding: { table: 'cp1125', esc_t: 3 }, source: 'own' });
    expect(chooseEncoding(null, XP)).toEqual({ encoding: { table: 'cp866', esc_t: 17 }, source: 'shared' });
    expect(chooseEncoding(undefined, null)).toEqual({ encoding: { table: 'windows1251', esc_t: null }, source: 'default' });
  });

  it('matches the driver with spaces collapsed, and never an empty one', () => {
    expect(sharedFor([XP], '  XP-58 ')).toBe(XP);
    expect(sharedFor([XP], 'XP-80')).toBeNull();
    expect(sharedFor([{ ...XP, driver: '' }], '')).toBeNull();
  });
});

describe('the approved list on a printer', () => {
  it('a printer nobody set up prints with the approved profile for its driver', async () => {
    posRequest.mockResolvedValue({ profiles: [XP, { junk: true }] });
    expect(await refreshSharedProfiles()).toEqual([XP]);
    const resolved = await resolvePrinterEncoding('Каса');
    expect(resolved).toMatchObject({ source: 'shared', driver: 'XP-58', encoding: { table: 'cp866', esc_t: 17 } });

    await printReceipt('Каса', { items: [] } as unknown as ReceiptData);
    expect(invoke).toHaveBeenCalledWith('print_receipt', expect.objectContaining({ encoding: { table: 'cp866', esc_t: 17 } }));
  });

  it('keeps the list for a till without a network', async () => {
    posRequest.mockResolvedValueOnce({ profiles: [XP] });
    await refreshSharedProfiles();
    resetPrinterProfilesForTests();
    posRequest.mockRejectedValue(new Error('offline'));
    expect(await refreshSharedProfiles()).toEqual([XP]);
    expect((await resolvePrinterEncoding('Каса')).source).toBe('shared');
  });

  it('the owner’s own pick wins, and taking it back returns to the approved one', async () => {
    posRequest.mockResolvedValue({ profiles: [XP] });
    await refreshSharedProfiles();
    await savePrinterEncoding('Каса', { table: 'windows1251', esc_t: 73 });
    expect(await resolvePrinterEncoding('Каса')).toMatchObject({ source: 'own', encoding: { esc_t: 73 }, shared: XP });
    await forgetOwnEncoding('Каса');
    expect((await resolvePrinterEncoding('Каса')).source).toBe('shared');
  });

  it('asks the OS nothing when there is nothing to match or report', async () => {
    expect(await resolvePrinterEncoding('Каса')).toMatchObject({ source: 'default', driver: '' });
    expect(invoke).not.toHaveBeenCalledWith('list_printers');
  });
});

describe('reporting the owner’s pick', () => {
  it('reports at the third document, once, with the number the profile selects', async () => {
    posRequest.mockResolvedValue({ ok: true });
    await savePrinterEncoding('Каса', { table: 'cp866', esc_t: null });
    await notePrinted('Каса', 58);
    await notePrinted('Каса', 58);
    expect(reports()).toHaveLength(0);
    await notePrinted('Каса', 58);
    expect(reports()).toEqual([
      ['post', '/printer-profiles/report', { driver: 'XP-58', table: 'cp866', esc_t: 17, prints: 3, paper_width_mm: 58 }],
    ]);
    await notePrinted('Каса', 58);
    expect(reports()).toHaveLength(1);
  });

  it('a changed profile counts again; a failed report is tried at the next print', async () => {
    await savePrinterEncoding('Каса', { table: 'cp866', esc_t: null });
    await notePrinted('Каса', 80);
    await savePrinterEncoding('Каса', { table: 'windows1251', esc_t: 73 });
    posRequest.mockRejectedValueOnce(new Error('offline'));
    for (let i = 0; i < 3; i++) await notePrinted('Каса', 80);
    expect(reports()).toHaveLength(1); // tried and failed at the third
    posRequest.mockResolvedValue({ ok: true });
    await notePrinted('Каса', 80);
    expect(reports()).toHaveLength(2);
    expect(reports()[1][2]).toMatchObject({ table: 'windows1251', esc_t: 73, prints: 4, paper_width_mm: 80 });
  });

  it('never reports the approved profile or the default, nor a printer without a driver', async () => {
    posRequest.mockResolvedValue({ profiles: [XP] });
    await refreshSharedProfiles();
    for (let i = 0; i < 4; i++) await notePrinted('Каса', 58);
    printersAre([{ name: 'PDF', driver: '' }]);
    resetPrinterProfilesForTests();
    await savePrinterEncoding('PDF', { table: 'cp866', esc_t: null });
    for (let i = 0; i < 4; i++) await notePrinted('PDF', 58);
    expect(reports()).toHaveLength(0);
  });

  it('a print counts itself in the background', async () => {
    posRequest.mockResolvedValue({ ok: true });
    await savePrinterEncoding('Каса', { table: 'cp866', esc_t: null });
    for (let i = 0; i < 3; i++) await printReceipt('Каса', { items: [] } as unknown as ReceiptData);
    await vi.waitFor(() => expect(reports()).toHaveLength(1));
  });
});
