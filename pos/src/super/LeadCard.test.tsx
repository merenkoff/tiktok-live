// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The lead card (TechDocs/CRM_LEADS.md): a status tap and a note are two
// separate writes, and the answer to the first must not wipe a note the
// super admin is still typing — found by hand on the first live run.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SuperLeadCard } from './superApi';

const card = (over: Partial<SuperLeadCard> = {}): SuperLeadCard => ({
  id: 7,
  phone: '+380671234567',
  name: 'Олена',
  status: 'new',
  note: '',
  created_at: '2026-10-24T09:00:00Z',
  last_touch_at: '2026-10-24T09:30:00Z',
  touches: 1,
  interest: 'kafe',
  history: [],
  ...over,
});

const getLead = vi.fn<(id: number) => Promise<SuperLeadCard>>();
const patchLead = vi.fn<(id: number, body: { status?: string; note?: string }) => Promise<SuperLeadCard>>();

vi.mock('./superApi', async () => {
  const real = await vi.importActual<typeof import('./superApi')>('./superApi');
  return {
    ...real,
    superApi: {
      getLead: (id: number) => getLead(id),
      patchLead: (id: number, body: { status?: string; note?: string }) => patchLead(id, body),
    },
  };
});

const { LeadCard } = await import('./LeadCard');

afterEach(() => vi.clearAllMocks());

describe('LeadCard', () => {
  it('keeps the note being typed when a status change comes back', async () => {
    const user = userEvent.setup();
    getLead.mockResolvedValue(card());
    let answerStatus: (c: SuperLeadCard) => void = () => {};
    patchLead.mockImplementationOnce(
      () => new Promise<SuperLeadCard>((resolve) => (answerStatus = resolve))
    );
    const onSaved = vi.fn();
    render(<LeadCard id={7} onClose={() => {}} onSaved={onSaved} />);

    await user.click(await screen.findByRole('button', { name: 'Зв’язались' }));
    await user.type(screen.getByLabelText('Нотатка'), 'Передзвонити в понеділок');
    answerStatus(card({ status: 'contacted' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: 7, status: 'contacted', note: '' }));
    expect(screen.getByLabelText('Нотатка')).toHaveValue('Передзвонити в понеділок');

    patchLead.mockResolvedValueOnce(card({ status: 'contacted', note: 'Передзвонити в понеділок' }));
    await user.click(screen.getByRole('button', { name: 'Зберегти нотатку' }));
    expect(patchLead).toHaveBeenLastCalledWith(7, { note: 'Передзвонити в понеділок' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Зберегти нотатку' })).toBeDisabled());
  });

  it('marks the current status and does not resend it', async () => {
    const user = userEvent.setup();
    getLead.mockResolvedValue(card({ status: 'demo' }));
    render(<LeadCard id={7} onClose={() => {}} onSaved={() => {}} />);
    const demo = await screen.findByRole('button', { name: 'Демо' });
    expect(demo).toHaveAttribute('aria-pressed', 'true');
    await user.click(demo);
    expect(patchLead).not.toHaveBeenCalled();
  });
});
