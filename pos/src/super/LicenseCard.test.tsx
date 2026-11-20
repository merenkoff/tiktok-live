// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The licence card (TechDocs/POS_LICENSING.md, phase 2F): «Видалити записи»
// asks once, then forgets the pings and hands the list its cue to re-read.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SuperLicenseDetail } from './superApi';

const detail = (over: Partial<SuperLicenseDetail> = {}): SuperLicenseDetail => ({
  fingerprint: '',
  verified: false,
  licensee: null,
  plan: null,
  instance_limit: null,
  installs: 1,
  origins: 1,
  over_limit: false,
  cloned: false,
  first_seen: '2026-11-06T10:13:38Z',
  last_seen: '2026-11-06T11:35:31Z',
  total_pings: 4,
  instances: [
    {
      instance_id: '36ec4ed9-1dbc-4e81-9af1-6f1afbb9e283',
      verified: false,
      last_seen: '2026-11-06T11:35:31Z',
      cloned: false,
      origins: [{ url: 'https://the-live.shop', first_seen: '2026-11-06T10:13:38Z', last_seen: '2026-11-06T11:35:31Z', seen_count: 4 }],
    },
  ],
  ...over,
});

const getLicense = vi.fn<(fp: string) => Promise<SuperLicenseDetail>>();
const deleteLicense = vi.fn<(fp: string) => Promise<{ deleted: number }>>();

vi.mock('./superApi', async () => {
  const real = await vi.importActual<typeof import('./superApi')>('./superApi');
  return {
    ...real,
    superApi: {
      getLicense: (fp: string) => getLicense(fp),
      deleteLicense: (fp: string) => deleteLicense(fp),
    },
  };
});

const { LicenseCard } = await import('./LicenseCard');

afterEach(() => vi.clearAllMocks());

describe('LicenseCard', () => {
  it('names a keyless group «Без ключа» and deletes its pings only after a confirmation', async () => {
    const user = userEvent.setup();
    getLicense.mockResolvedValue(detail());
    deleteLicense.mockResolvedValue({ deleted: 4 });
    const onDeleted = vi.fn();
    render(<LicenseCard fingerprint="none" onClose={() => {}} onDeleted={onDeleted} />);

    expect(await screen.findByRole('heading', { name: 'Без ключа' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Видалити записи' }));
    expect(deleteLicense).not.toHaveBeenCalled();
    expect(screen.getByText(/Прибрати 4 пінгів/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ні' }));
    expect(screen.queryByText(/Прибрати 4 пінгів/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Видалити записи' }));
    await user.click(screen.getByRole('button', { name: 'Так, видалити' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(deleteLicense).toHaveBeenCalledWith('none');
  });

  it('marks a development run on its own copy and on the group, and leaves a real copy unmarked', async () => {
    const base = detail().instances[0];
    getLicense.mockResolvedValue(
      detail({
        installs: 2,
        dev_installs: 1,
        instances: [
          { ...base, instance_id: 'b58b7bcb-e505-473c-8b5e-bde7781262eb', dev: true, origins: [{ ...base.origins[0], url: '', ip: '34.44.29.51' }] },
          { ...base, dev: false },
        ],
      }),
    );
    render(<LicenseCard fingerprint="none" onClose={() => {}} />);

    expect(await screen.findByText('розробка: 1 з 2')).toBeInTheDocument();
    const devCopy = screen.getByText('b58b7bcb-e505-473c-8b5e-bde7781262eb').closest('div.rounded-sq') as HTMLElement;
    expect(within(devCopy).getByText('розробка')).toBeInTheDocument();
    expect(within(devCopy).getByText('IP 34.44.29.51')).toBeInTheDocument();
    const realCopy = screen.getByText('36ec4ed9-1dbc-4e81-9af1-6f1afbb9e283').closest('div.rounded-sq') as HTMLElement;
    expect(within(realCopy).queryByText('розробка')).not.toBeInTheDocument();
  });

  it('draws no mark at all for a server older than it', async () => {
    getLicense.mockResolvedValue(detail());
    render(<LicenseCard fingerprint="none" onClose={() => {}} />);
    expect(await screen.findByRole('heading', { name: 'Без ключа' })).toBeInTheDocument();
    // The footnote names the word; no pill (the group's or a copy's) starts with it.
    expect(screen.queryByText(/^розробка/)).not.toBeInTheDocument();
  });

  it('shows the server’s refusal and keeps the card when the delete fails', async () => {
    const user = userEvent.setup();
    getLicense.mockResolvedValue(detail({ fingerprint: 'ab'.repeat(32), verified: true, licensee: 'Шабля' }));
    deleteLicense.mockRejectedValue(new Error('Network Error'));
    const onDeleted = vi.fn();
    render(<LicenseCard fingerprint={'ab'.repeat(32)} onClose={() => {}} onDeleted={onDeleted} />);

    expect(await screen.findByRole('heading', { name: 'Шабля' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Видалити записи' }));
    await user.click(screen.getByRole('button', { name: 'Так, видалити' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Видалити записи' })).toBeInTheDocument());
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.getByText(/Network Error|мереж/i)).toBeInTheDocument();
  });
});
