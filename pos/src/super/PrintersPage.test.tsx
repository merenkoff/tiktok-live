// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// «Принтери» in the super admin (TechDocs/POS_PRINTER_PROFILES.md): the tills'
// reports with the store that sent each, approving one under a readable name,
// renaming and removing the approved one.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { superApi, type SuperPrinterProfiles } from './superApi';
import { PrintersPage } from './PrintersPage';

const report = {
  id: 7,
  driver: 'XP-58',
  table: 'cp866' as const,
  esc_t: 17,
  paper_width_mm: 58,
  prints: 3,
  store_id: 13,
  store_code: 'shablya',
  store_name: 'Шабля',
  first_reported_at: '2026-11-09T15:00:00.000Z',
  last_reported_at: '2026-11-09T15:10:00.000Z',
  approved: false,
};
const profile = {
  id: 2,
  driver: 'XP-58',
  title: 'Xprinter XP-58IIH',
  table: 'cp866' as const,
  esc_t: 17,
  source_store_id: 13,
  source_store_code: 'shablya',
  approved_at: '2026-11-09T15:20:00.000Z',
  updated_at: '2026-11-09T15:20:00.000Z',
};

let state: SuperPrinterProfiles;

beforeEach(() => {
  state = { reports: [report], profiles: [] };
  vi.restoreAllMocks();
  vi.spyOn(superApi, 'printerProfiles').mockImplementation(async () => structuredClone(state));
});

describe('PrintersPage', () => {
  it('lists what the tills sent, with the store code', async () => {
    render(<PrintersPage />);
    const row = (await screen.findByText('shablya')).closest('tr')!;
    expect(within(row).getByText('XP-58')).toBeInTheDocument();
    expect(within(row).getByText('CP866 · таблиця 17')).toBeInTheDocument();
    expect(within(row).getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Поки жодного.')).toBeInTheDocument();
  });

  it('approves a report under the name typed', async () => {
    const approve = vi.spyOn(superApi, 'approvePrinterReport').mockImplementation(async () => {
      state = { reports: [{ ...report, approved: true }], profiles: [profile] };
      return profile;
    });
    render(<PrintersPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Затвердити для всіх' }));
    const name = screen.getByLabelText('Назва для всіх');
    expect(name).toHaveValue('XP-58');
    fireEvent.change(name, { target: { value: 'Xprinter XP-58IIH' } });
    fireEvent.click(screen.getByRole('button', { name: 'Затвердити' }));
    await waitFor(() => expect(approve).toHaveBeenCalledWith(7, 'Xprinter XP-58IIH'));
    expect(await screen.findByText('Xprinter XP-58IIH')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Від кас' })).getByText('Затверджено')).toBeInTheDocument();
  });

  it('renames and removes an approved profile', async () => {
    state = { reports: [{ ...report, approved: true }], profiles: [profile] };
    const rename = vi.spyOn(superApi, 'renamePrinterProfile').mockResolvedValue({ ...profile, title: 'XP-58IIH' });
    const remove = vi.spyOn(superApi, 'removePrinterProfile').mockResolvedValue();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<PrintersPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Перейменувати' }));
    fireEvent.change(screen.getByLabelText('Нова назва'), { target: { value: 'XP-58IIH' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(rename).toHaveBeenCalledWith(2, 'XP-58IIH'));
    fireEvent.click(screen.getByRole('button', { name: 'Прибрати' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(2));
  });

  it('says the server’s refusal', async () => {
    vi.spyOn(superApi, 'printerProfiles').mockRejectedValue(new Error('boom'));
    render(<PrintersPage />);
    await waitFor(() => expect(screen.getByText(/boom|зв’язку|помилк/i)).toBeInTheDocument());
  });
});
