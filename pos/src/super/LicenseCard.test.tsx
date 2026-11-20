// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The licence card (TechDocs/POS_LICENSING.md, phase 2F): «Видалити записи»
// asks once, then forgets the pings and hands the list its cue to re-read.

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SuperCopyNotice, SuperLicenseDetail, SuperNoticeSettings } from './superApi';

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
const getLicenseNotice = vi.fn<() => Promise<SuperNoticeSettings>>();
const setCopyNotice = vi.fn<(id: string, notice: SuperCopyNotice) => Promise<SuperCopyNotice | null>>();

vi.mock('./superApi', async () => {
  const real = await vi.importActual<typeof import('./superApi')>('./superApi');
  return {
    ...real,
    superApi: {
      getLicense: (fp: string) => getLicense(fp),
      deleteLicense: (fp: string) => deleteLicense(fp),
      getLicenseNotice: () => getLicenseNotice(),
      setCopyNotice: (id: string, notice: SuperCopyNotice) => setCopyNotice(id, notice),
    },
  };
});

const { LicenseCard } = await import('./LicenseCard');

const NOTICE: SuperNoticeSettings = {
  policy: { warn_after: 30, text: null, guests: false },
  defaults: { warn_after: 30, text: 'Ця копія працює без ліцензійного ключа.', text_max: 300 },
};

// A server older than the notice has no such route; a test that wants the
// editor says so itself.
// (Braces on purpose: a hook that RETURNS a function hands vitest a teardown.)
beforeEach(() => {
  getLicenseNotice.mockRejectedValue(new Error('404'));
});
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

  it('shows how close a copy without a key is to its notice, and saves a text of its own for that copy alone', async () => {
    const user = userEvent.setup();
    const base = detail().instances[0];
    getLicenseNotice.mockResolvedValue(NOTICE);
    getLicense.mockResolvedValue(detail({ instances: [{ ...base, client_launches: 24, notice: null }] }));
    setCopyNotice.mockResolvedValue({ warn_after: null, text: 'Заклад «Х»: напишіть авторові.', guests: true });
    render(<LicenseCard fingerprint="none" onClose={() => {}} />);

    // 24 of the 30 that apply to everyone: the author sees it coming.
    expect(await screen.findByText('запусків клієнтів: 24 з 30')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Попередження для цієї копії' }));
    // The field shows, in grey, what the copy reads today.
    expect(screen.getByLabelText('Текст для цієї копії')).toHaveAttribute('placeholder', NOTICE.defaults.text);

    await user.type(screen.getByLabelText('Текст для цієї копії'), 'Заклад «Х»: напишіть авторові.');
    await user.selectOptions(screen.getByLabelText('Показувати гостям'), 'yes');
    await user.click(screen.getByRole('button', { name: 'Зберегти для копії' }));

    await waitFor(() => expect(setCopyNotice).toHaveBeenCalledTimes(1));
    // An empty threshold stays «as for everyone»: only what was typed is the copy's own.
    expect(setCopyNotice).toHaveBeenCalledWith(base.instance_id, {
      warn_after: null,
      text: 'Заклад «Х»: напишіть авторові.',
      guests: true,
    });
    expect(await screen.findByText(/свої налаштування попередження/)).toBeInTheDocument();

    // «Як для всіх» clears all three.
    setCopyNotice.mockResolvedValue(null);
    await user.click(screen.getByRole('button', { name: 'Як для всіх' }));
    await waitFor(() => expect(setCopyNotice).toHaveBeenLastCalledWith(base.instance_id, { warn_after: null, text: null, guests: null }));
  });

  it('says the notice is being shown once the copy is past its own threshold', async () => {
    const base = detail().instances[0];
    getLicenseNotice.mockResolvedValue(NOTICE);
    getLicense.mockResolvedValue(
      detail({ instances: [{ ...base, client_launches: 12, notice: { warn_after: 10, text: null, guests: null } }] }),
    );
    render(<LicenseCard fingerprint="none" onClose={() => {}} />);
    expect(await screen.findByText(/запусків клієнтів: 12 з 10 · попередження показується/)).toBeInTheDocument();
  });

  it('offers no notice editor for a copy whose key verified — such a copy never counts and never warns', async () => {
    const base = detail().instances[0];
    getLicenseNotice.mockResolvedValue(NOTICE);
    getLicense.mockResolvedValue(
      detail({ fingerprint: 'ab'.repeat(32), verified: true, licensee: 'Шабля', instances: [{ ...base, verified: true }] }),
    );
    render(<LicenseCard fingerprint={'ab'.repeat(32)} onClose={() => {}} />);
    expect(await screen.findByRole('heading', { name: 'Шабля' })).toBeInTheDocument();
    await waitFor(() => expect(getLicenseNotice).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Попередження для цієї копії' })).not.toBeInTheDocument();
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
