// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * The bench's third ending: keep this composition as a catalogue recipe
 * (`TechDocs/POS_FLORIST_BENCH.md` §11.1).
 *
 * Nothing physical happens — no production document, no stock, no stems off the
 * shelf. The bouquet stays on the bench afterwards, because saving a recipe is
 * not finishing with it: the florist usually rings or displays the very bouquet
 * they just described.
 *
 * The name is **required** here, unlike the window bouquet which the production
 * document's number names: a recipe nobody can name is one nobody finds again.
 */

import { useState } from 'react';
import { BookMarked, X } from 'lucide-react';
import { api, formatUah, uahInputToCents } from '@pos/platform';
import { BouquetPhoto } from './BouquetPhoto';

interface Props {
  computedCents: number;
  components: Array<{ component_variant_id: number; quantity: number }>;
  onSaved: (name: string) => void;
  onClose: () => void;
}

export function RecipeSheet({ computedCents, components, onSaved, onClose }: Props) {
  const [name, setName] = useState('');
  const [priceText, setPriceText] = useState(
    (computedCents / 100).toFixed(2).replace('.', ',')
  );
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceCents = uahInputToCents(priceText);
  const rounded = priceCents !== computedCents;

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const saved = await api.saveBouquetRecipe({
        name: name.trim(),
        components,
        // Same rule as the window: send a price only when it differs, so the
        // server stays the one place that prices a composition.
        price_cents: rounded ? priceCents : null,
        image_url: imageUrl,
      });
      onSaved(saved.name);
    } catch (err) {
      const sent = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(sent || 'Не вдалося зберегти рецепт');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-end md:place-items-center p-4">
      <div
        className="bg-white rounded-sq w-full max-w-sm overflow-hidden animate-fade-up shadow-lg"
        data-testid="recipe-sheet"
      >
        <div className="px-4 py-3.5 border-b border-sq-divider flex items-center justify-between gap-3">
          <h3 className="font-semibold text-sq-text">Зберегти як рецепт</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-11 min-w-11 grid place-items-center text-sq-secondary disabled:opacity-40"
            aria-label="Закрити"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-xs text-sq-muted">
            Букет лишиться на столі — рецепт це шаблон, який можна збирати знову. Стебла
            зараз не списуються.
          </p>

          <BouquetPhoto value={imageUrl} onChange={setImageUrl} disabled={busy} />

          <label className="block">
            <span className="text-sm text-sq-secondary">Назва рецепта</span>
            <input
              className="pos-field mt-1.5"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Весняний"
              autoFocus
              data-testid="recipe-name"
            />
          </label>

          <label className="block">
            <span className="text-sm text-sq-secondary">Ціна</span>
            <input
              className="pos-field mt-1.5 text-lg"
              inputMode="decimal"
              value={priceText}
              onChange={(e) => setPriceText(e.target.value.replace(/[^\d.,]/g, ''))}
              data-testid="recipe-price"
            />
            <span className="mt-1 block text-xs text-sq-muted">
              {rounded ? `Розраховано: ${formatUah(computedCents)}` : 'Стебла та робота флориста'}
            </span>
          </label>

          {error && (
            <p className="text-sm text-red-600" data-testid="recipe-error">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={busy || !name.trim() || priceCents <= 0}
            onClick={() => void save()}
            className="sq-btn-primary min-h-12 w-full flex items-center justify-center gap-2"
            data-testid="recipe-submit"
          >
            <BookMarked size={18} />
            {busy ? 'Зберігаємо…' : 'Зберегти рецепт'}
          </button>
        </div>
      </div>
    </div>
  );
}
