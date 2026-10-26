// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

import { useState } from 'react';
import { superApi, superErrorText, type ChoiceQrPlan, type SuperStoreRow } from './superApi';

const CHUNK = 20;
const DAYS: Array<[string, string]> = [
  ['1', 'Пн'], ['2', 'Вт'], ['3', 'Ср'], ['4', 'Чт'], ['5', 'Пт'], ['6', 'Сб'], ['7', 'Нд'],
];

function hoursText(hours: ChoiceQrPlan['place']['hours']): string {
  if (!hours) return 'немає';
  return DAYS.map(([k, d]) => (hours[k] ? `${d} ${hours[k].open}–${hours[k].close}` : `${d} —`)).join(', ');
}

const uah = (cents: number) => `${(cents / 100).toLocaleString('uk-UA')} ₴`;

/**
 * «Імпорт меню з ChoiceQR» (TechDocs/POS_ONBOARDING.md, O2): the menu page's
 * categories, dishes and photos into this store, plus the logo, address and
 * hours where its profile is still empty. Preview first — the numbers come
 * from the server's plan — then the chunks, one request each, so a long menu
 * never outlives a proxy timeout. Running it again creates nothing twice.
 */
export function ChoiceQrImport({ store }: { store: SuperStoreRow }) {
  const [url, setUrl] = useState('');
  const [plan, setPlan] = useState<ChoiceQrPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: number; photosFailed: string[]; profile: string[] } | null>(null);

  async function preview() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setPlan(await superApi.previewChoiceQr(store.id, url.trim()));
    } catch (err) {
      setPlan(null);
      setError(superErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    const sum = { created: 0, skipped: 0, photosFailed: [] as string[], profile: [] as string[] };
    try {
      let offset = 0;
      for (;;) {
        const chunk = await superApi.importChoiceQrChunk(store.id, url.trim(), offset, CHUNK);
        sum.created += chunk.created.length;
        sum.skipped += chunk.skipped_existing;
        sum.photosFailed.push(...chunk.photos_failed);
        if (chunk.profile) sum.profile = chunk.profile;
        setProgress({ done: chunk.next_offset, total: chunk.total });
        if (chunk.done) break;
        offset = chunk.next_offset;
      }
      setResult(sum);
      setPlan(null);
    } catch (err) {
      // What landed stays: running the import again picks up where it stopped.
      setError(`${superErrorText(err)} Створено до збою: ${sum.created}. Запустіть імпорт ще раз — створене не повториться.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-2 border-t border-sq-divider pt-4" aria-label="Імпорт меню з ChoiceQR">
      <p className="sq-section-label">Імпорт меню з ChoiceQR</p>
      <p className="text-xs text-sq-secondary">
        Категорії стануть тегами (напої — на бар, решта — на кухню), страви — картками з нульовим залишком, той самий
        напій різного об’єму — варіантами. Фото копіюються до нас. Логотип, адреса, телефон і години роботи заповнюють лише
        порожні поля профілю. Повторний імпорт нічого не дублює.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Посилання на меню ChoiceQR"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setPlan(null);
          }}
          placeholder="https://заклад.choiceqr.com/menu"
          className="min-w-0 flex-1 rounded-sq border border-sq-divider bg-sq-surface px-2 py-1.5 text-xs"
        />
        <button
          type="button"
          disabled={busy || !url.trim()}
          onClick={() => void preview()}
          className="rounded-sq border border-sq-divider px-3 py-1.5 text-xs disabled:opacity-50"
        >
          {busy && !progress ? 'Читаю…' : 'Переглянути'}
        </button>
      </div>

      {error && <p className="text-xs text-rose-600">{error}</p>}

      {plan && (
        <div className="space-y-2 rounded-sq border border-sq-divider bg-sq-surface p-3" data-testid="choiceqr-plan">
          <p className="text-xs text-sq-text">
            <span className="font-medium">{plan.place.name}</span>
            {plan.place.address ? ` · ${plan.place.address}` : ''} · години: {hoursText(plan.place.hours)} · логотип:{' '}
            {plan.place.logo ? 'є' : 'немає'}
          </p>
          <p className="text-xs text-sq-text" data-testid="choiceqr-totals">
            Тегів нових: {plan.totals.tags_new} · карток нових: {plan.totals.products_new} ({plan.totals.variants_new} варіантів) ·
            уже є: {plan.totals.products_existing} · фото: {plan.totals.photos}
          </p>
          <ul className="space-y-1 text-xs">
            {plan.tags.map((tag) => (
              <li key={tag.name}>
                <details>
                  <summary className="cursor-pointer text-sq-text">
                    {tag.name} · {tag.station === 'bar' ? 'бар' : 'кухня'} · {tag.products}
                    {tag.exists ? ' · тег уже є' : ''}
                  </summary>
                  <ul className="ml-4 mt-1 space-y-0.5 text-sq-secondary">
                    {plan.products
                      .filter((p) => p.tag === tag.name)
                      .map((p) => (
                        <li key={p.name}>
                          {p.name} — {p.variants.map((v) => `${v.size ?? ''} ${uah(v.price_cents)}`.trim()).join(' / ')}
                          {p.photo_url ? ' · фото' : ''}
                          {p.exists ? ' · уже є' : ''}
                        </li>
                      ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
          {plan.warnings.length > 0 && (
            <ul className="space-y-0.5 rounded-sq bg-amber-50 p-2 text-xs text-amber-900">
              {plan.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            disabled={busy || plan.totals.products_new === 0}
            onClick={() => void run()}
            className="sq-btn-primary px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {plan.totals.products_new === 0 ? 'Нічого нового' : `Імпортувати ${plan.totals.products_new}`}
          </button>
        </div>
      )}

      {busy && progress && (
        <div className="space-y-1" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
          <div className="h-2 overflow-hidden rounded-full bg-sq-bg">
            <div className="h-full bg-sq-blue" style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} />
          </div>
          <p className="text-xs text-sq-secondary">
            {progress.done} / {progress.total}
          </p>
        </div>
      )}

      {result && (
        <p role="status" className="rounded-sq bg-emerald-50 p-2 text-xs text-emerald-900">
          Імпортовано карток: {result.created}
          {result.skipped ? `, уже були: ${result.skipped}` : ''}.
          {result.profile.length ? ` Профіль: ${result.profile.join(', ')}.` : ''}
          {result.photosFailed.length ? ` Без фото: ${result.photosFailed.join(', ')}.` : ''}
        </p>
      )}
    </section>
  );
}
