// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Кодування кирилиці» (HardwarePage): print a sheet of candidate profiles, tick
// the line that reads right, or find the printer's own table number — and have
// the choice kept for that printer.

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { db } from '../offline/db';
import { PrinterEncodingPicker } from './PrinterEncodingPicker';
import { api } from '../services/api';
import { resetPrinterProfilesForTests } from '../lib/printerProfiles';

vi.mock('../services/api', () => ({ api: { posRequest: vi.fn() } }));

async function stored(printer: string) {
  return (await db.meta.get(`printerEncoding:${printer}`))?.value;
}

async function openPicker(printer = 'Xprinter', paper: 58 | 80 = 58) {
  render(<PrinterEncodingPicker printerName={printer} paperWidth={paper} />);
  const summary = screen.getByTestId('printer-encoding-summary');
  await waitFor(() => expect(summary).toHaveTextContent('Windows-1251')); // loaded (or default)
  fireEvent.click(screen.getByRole('button', { name: /Кодування кирилиці/ }));
}

beforeEach(async () => {
  vi.mocked(invoke).mockClear();
  vi.mocked(invoke).mockResolvedValue(undefined);
  vi.mocked(api.posRequest).mockReset();
  vi.mocked(api.posRequest).mockRejectedValue(new Error('offline'));
  resetPrinterProfilesForTests();
  await db.meta.clear();
});

describe('PrinterEncodingPicker', () => {
  it('is folded away, and says which profile is in force', async () => {
    render(<PrinterEncodingPicker printerName="Xprinter" paperWidth={58} />);
    expect(await screen.findByText(/Windows-1251 · таблиця 46 \(за замовчуванням\)/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Надрукувати пробний аркуш' })).toBeNull();
    expect(screen.getByRole('button', { name: /Кодування кирилиці/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('prints a sheet of the three standard profiles on the roll the printer has', async () => {
    await openPicker('Xprinter', 80);
    fireEvent.click(screen.getByRole('button', { name: 'Надрукувати пробний аркуш' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(invoke).toHaveBeenCalledWith('print_encoding_test', {
      printerName: 'Xprinter',
      paperWidthMm: 80,
      candidates: [
        { table: 'windows1251', esc_t: null, label: 'A' },
        { table: 'cp866', esc_t: null, label: 'B' },
        { table: 'cp1125', esc_t: null, label: 'C' },
      ],
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Надіслано на друк');
  });

  it('keeps the profile the person ticked, for that printer only', async () => {
    await openPicker('Xprinter');
    fireEvent.click(screen.getByRole('radio', { name: /B · CP866 · таблиця 17/ }));
    await waitFor(async () => expect(await stored('Xprinter')).toEqual({ table: 'cp866', esc_t: null }));
    expect(await stored('Bar-1')).toBeUndefined();
    expect(screen.getByTestId('printer-encoding-summary')).toHaveTextContent('CP866 · таблиця 17 · сховати');
    expect(screen.getByRole('radio', { name: /B · CP866/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /A · Windows-1251/ })).not.toBeChecked();
  });

  it('shows the profile that was chosen before, when the printer is opened again', async () => {
    await db.meta.put({ key: 'printerEncoding:Xprinter', value: { table: 'cp1125', esc_t: null } });
    render(<PrinterEncodingPicker printerName="Xprinter" paperWidth={58} />);
    const summary = screen.getByTestId('printer-encoding-summary');
    await waitFor(() => expect(summary).toHaveTextContent('CP1125 · таблиця 44'));
    expect(summary).not.toHaveTextContent('за замовчуванням');
  });

  it('keeps its own table number, and an empty field goes back to the standard one', async () => {
    await openPicker('Xprinter');
    const number = screen.getByLabelText(/Номер таблиці \(ESC t\)/);
    fireEvent.change(number, { target: { value: '73' } });
    await waitFor(async () => expect(await stored('Xprinter')).toEqual({ table: 'windows1251', esc_t: 73 }));
    expect(screen.getByTestId('printer-encoding-summary')).toHaveTextContent('Windows-1251 · таблиця 73');

    fireEvent.change(number, { target: { value: '' } });
    await waitFor(async () => expect(await stored('Xprinter')).toEqual({ table: 'windows1251', esc_t: null }));
  });

  it('refuses a number that is not 0–255 without saving it', async () => {
    await openPicker('Xprinter');
    const number = screen.getByLabelText(/Номер таблиці \(ESC t\)/);
    fireEvent.change(number, { target: { value: '300' } });
    expect(await screen.findByText('Ціле число від 0 до 255.')).toBeInTheDocument();
    expect(number).toHaveAttribute('aria-invalid', 'true');
    expect(await stored('Xprinter')).toBeUndefined();
    fireEvent.change(number, { target: { value: '30' } });
    await waitFor(async () => expect(await stored('Xprinter')).toEqual({ table: 'windows1251', esc_t: 30 }));
    expect(screen.queryByText('Ціле число від 0 до 255.')).toBeNull();
  });

  it('switches the table of the profile and keeps the number typed', async () => {
    await openPicker('Xprinter');
    fireEvent.change(screen.getByLabelText(/Номер таблиці \(ESC t\)/), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Кодування символів'), { target: { value: 'cp866' } });
    await waitFor(async () => expect(await stored('Xprinter')).toEqual({ table: 'cp866', esc_t: 7 }));
  });

  it('prints every table number in a range, in the table that is selected', async () => {
    await openPicker('Xprinter');
    fireEvent.change(screen.getByLabelText('Кодування символів'), { target: { value: 'cp866' } });
    fireEvent.change(screen.getByLabelText('Номери від'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Номери до'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Надрукувати номери' }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('print_encoding_test', expect.anything()));
    expect(invoke).toHaveBeenLastCalledWith('print_encoding_test', {
      printerName: 'Xprinter',
      paperWidthMm: 58,
      candidates: [5, 6, 7, 8].map((n) => ({ table: 'cp866', esc_t: n })),
    });
    expect(await screen.findByRole('status')).toHaveTextContent('впишіть його номер');
  });

  it('does not print a range that is not made of whole numbers 0–255', async () => {
    await openPicker('Xprinter');
    fireEvent.change(screen.getByLabelText('Номери до'), { target: { value: '999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Надрукувати номери' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Номери мають бути цілими від 0 до 255.');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('says why when the printer refuses the sheet, and lets the person try again', async () => {
    vi.mocked(invoke).mockRejectedValueOnce('Принтер недоступний');
    await openPicker('Xprinter');
    const print = screen.getByRole('button', { name: 'Надрукувати пробний аркуш' });
    fireEvent.click(print);
    expect(await screen.findByRole('status')).toHaveTextContent('Помилка друку: Принтер недоступний');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Надрукувати пробний аркуш' })).toBeEnabled());
  });

  it('a printer nobody set up follows LiveShop’s profile for its driver, and the owner can return to it', async () => {
    vi.mocked(api.posRequest).mockResolvedValue({
      profiles: [{ driver: 'XP-58', title: 'Xprinter XP-58IIH', table: 'cp866', esc_t: 17 }],
    });
    vi.mocked(invoke).mockImplementation(async (cmd: string) =>
      cmd === 'list_printers' ? [{ name: 'Xprinter', is_default: true, driver: 'XP-58' }] : undefined
    );
    render(<PrinterEncodingPicker printerName="Xprinter" paperWidth={58} />);
    expect(
      await screen.findByText(/CP866 · таблиця 17 — налаштування LiveShop для «Xprinter XP-58IIH»/)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Кодування кирилиці/ }));
    expect(screen.getByText('Драйвер принтера: XP-58')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /A · Windows-1251/ }));
    await waitFor(async () => expect(await stored('Xprinter')).toEqual({ table: 'windows1251', esc_t: null }));
    fireEvent.click(screen.getByRole('button', { name: 'Використати налаштування LiveShop' }));
    await waitFor(async () => expect(await stored('Xprinter')).toBeNull());
    expect(screen.getByTestId('printer-encoding-summary')).toHaveTextContent('налаштування LiveShop');
  });
});
