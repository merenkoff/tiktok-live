// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The catalog tile, and specifically the difference between «this product has
// no photo» and «its photo did not load».
//
// Those two look identical on screen — both show the grey caption — and that is
// how a real bug hid: in a remote module the tile bundled its own copy of
// `lib/urls`, built with an empty `VITE_API_BASE`, so every photo resolved
// against the POS host instead of the API, 404'd, and fell back. It read as «the
// demo shop has no pictures». These pin the two states apart.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductTile } from './ProductTile';

describe('ProductTile', () => {
  it('draws the photo when there is one', () => {
    render(
      <ProductTile
        name="Троянда Avalanche"
        subtitle="Біла · 60 см · 95 шт"
        imageUrl="/demo-flowers/rose-avalanche.svg"
        onClick={() => {}}
      />
    );

    const img = document.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toContain('/demo-flowers/rose-avalanche.svg');
    // The caption belongs to the no-photo state; with a photo it must not be
    // the thing the cashier sees instead of one.
    expect(screen.queryByText('Біла · 60 см · 95 шт')).toBeNull();
  });

  it('falls back to the caption when there is no photo', () => {
    render(<ProductTile name="Троянда" subtitle="Біла · 60 см" onClick={() => {}} />);

    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('Біла · 60 см')).toBeInTheDocument();
  });

  it('falls back to the caption when the photo fails to load', () => {
    // The state the remote-module bug produced. Identical on screen to the one
    // above, which is exactly why it went unnoticed.
    render(
      <ProductTile
        name="Троянда"
        subtitle="Біла · 60 см"
        imageUrl="/demo-flowers/gone.svg"
        onClick={() => {}}
      />
    );

    fireEvent.error(document.querySelector('img')!);

    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('Біла · 60 см')).toBeInTheDocument();
  });

  it('is the whole tile that takes the tap, decoration included', () => {
    // The image and the captions are `pointer-events-none` on purpose: without
    // it the `<img>` was the hit target and a tap on the middle of a tile did
    // nothing.
    const onClick = vi.fn();
    render(
      <ProductTile
        name="Троянда"
        imageUrl="/demo-flowers/rose.svg"
        priceCents={9000}
        onClick={onClick}
      />
    );

    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(document.querySelector('img')).toHaveClass('pointer-events-none');
  });

  it('marks what is out of stock and counts what is already in the bouquet', () => {
    const { rerender } = render(
      <ProductTile name="Троянда" stock={0} onClick={() => {}} />
    );
    expect(screen.getByText('немає')).toBeInTheDocument();

    rerender(<ProductTile name="Троянда" stock={12} count={9} onClick={() => {}} />);
    expect(screen.getByTestId('tile-count')).toHaveTextContent('9');
    expect(screen.queryByText('немає')).toBeNull();
  });
});
