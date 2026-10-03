// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

function open(onClose = vi.fn(), onSubmit?: () => void) {
  const view = render(
    <div data-testid="page">
      <button type="button">Відкрити</button>
      <Dialog
        title="Додати варіанти"
        onClose={onClose}
        testId="the-dialog"
        onSubmit={
          onSubmit
            ? (e) => {
                e.preventDefault();
                onSubmit();
              }
            : undefined
        }
        footer={<button type="submit">Готово</button>}
      >
        <label>
          Назва
          <input />
        </label>
      </Dialog>
    </div>
  );
  return { ...view, onClose };
}

describe('where the dialog opens', () => {
  it('hangs off the body, not off the page — and says it is a modal', () => {
    // A page wrapper that keeps a transform after `animate-fade-up` would be
    // the containing block for `position: fixed`; the portal keeps the dialog
    // on the window whatever the page above it is doing (PriceTagsDialog.test).
    const { getByTestId } = open();
    const overlay = getByTestId('the-dialog');
    expect(getByTestId('page').contains(overlay)).toBe(false);
    expect(overlay.parentElement).toBe(document.body);
    const dialog = screen.getByRole('dialog', { name: 'Додати варіанти' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});

describe('closing it', () => {
  it('closes on Escape, on the X, and on the scrim — never on a click inside', async () => {
    const { onClose } = open();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Закрити' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.mouseDown(screen.getByTestId('the-dialog'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('is its own form: Enter in a field submits the dialog, not the page', async () => {
    const onSubmit = vi.fn();
    open(vi.fn(), onSubmit);
    await userEvent.type(screen.getByLabelText('Назва'), 'x{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('focus', () => {
  it('lands on the first field when it opens and goes back to the opener when it closes', () => {
    const opener = document.createElement('button');
    opener.textContent = 'opener';
    document.body.appendChild(opener);
    opener.focus();
    const { unmount } = open();
    expect(document.activeElement).toBe(screen.getByLabelText('Назва'));
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
