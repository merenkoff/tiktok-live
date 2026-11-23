// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The catalog's tag strip: one root chip as before, or «Головна» and «Усі
// товари» side by side where the catalog has a home screen (migration 112).

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeTag } from '../../test/utils';
import { CatalogTagBar } from './CatalogTagBar';

const tags = [makeTag({ id: 7, name: 'Дівчатам', show_in_catalog_bar: true })];

describe('CatalogTagBar', () => {
  it('draws one «Усі товари» without onAll', () => {
    const onSelect = vi.fn();
    render(<CatalogTagBar tags={tags} activeId="all" showBack={false} backLabel="" onSelect={onSelect} onBack={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Головна' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Усі товари' }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('draws «Головна» and «Усі товари» with onAll, the active one on a plate', () => {
    const onSelect = vi.fn();
    const onAll = vi.fn();
    render(
      <CatalogTagBar tags={tags} activeId="home" showBack={false} backLabel="" onSelect={onSelect} onBack={vi.fn()} onAll={onAll} />
    );
    const home = screen.getByRole('button', { name: 'Головна' });
    const all = screen.getByRole('button', { name: 'Усі товари' });
    expect(home.className).toContain('bg-sq-selected');
    expect(all.className).not.toContain('bg-sq-selected ');
    fireEvent.click(all);
    expect(onAll).toHaveBeenCalled();
    fireEvent.click(home);
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
