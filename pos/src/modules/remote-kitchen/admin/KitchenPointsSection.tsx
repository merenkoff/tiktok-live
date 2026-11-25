// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// The kitchen's «Точки» (РК4): «Пауза прийому» and «Черга зараз», which every
// cafe's estimate reads, and the cafes that ask this kitchen with the dishes
// each one sells — the kitchen's own names, never a cafe's prices.

import { useEffect, useState } from 'react';
import { SectionHead } from '@pos/platform/ui';
import { serverMessage } from '../lib/hostPlatform';
import { listCafes, saveStatus, type KitchenCafe, type KitchenStatus } from './settingsApi';

const PAUSES = [15, 30, 60] as const;

const STATUS_TEXT: Record<KitchenCafe['status'], string> = {
  active: 'працює',
  paused: 'призупинено',
  revoked: 'відкликано',
};

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
}

export function KitchenPointsSection(): JSX.Element {
  const [cafes, setCafes] = useState<KitchenCafe[] | null>(null);
  const [status, setStatus] = useState<KitchenStatus | null>(null);
  const [load, setLoad] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    listCafes()
      .then((res) => {
        if (!live) return;
        setCafes(res.cafes);
        setStatus(res.status);
        setLoad(String(res.status.load_minutes));
      })
      .catch((e) => {
        if (live) setNote({ ok: false, text: serverMessage(e, 'Не вдалося прочитати точки') });
      });
    return () => {
      live = false;
    };
  }, []);

  async function change(body: Parameters<typeof saveStatus>[0], done: string) {
    setBusy(true);
    setNote(null);
    try {
      const next = await saveStatus(body);
      setStatus(next);
      setLoad(String(next.load_minutes));
      setNote({ ok: true, text: done });
    } catch (e) {
      setNote({ ok: false, text: serverMessage(e, 'Не вдалося зберегти') });
    } finally {
      setBusy(false);
    }
  }

  function saveLoad() {
    const minutes = Number(load.trim());
    if (load.trim() === '' || !Number.isInteger(minutes) || minutes < 0 || minutes > 180) {
      setNote({ ok: false, text: 'Черга: від 0 до 180 хвилин' });
      return;
    }
    void change({ load_minutes: minutes }, 'Чергу збережено');
  }

  return (
    <section aria-label="Точки" className="space-y-6">
      <div className="space-y-3">
        <SectionHead title="Прийом запитів" />
        {status && (
          <p className="text-[15px]" data-testid="rk-accepting">
            {status.accepting ? (
              <span className="text-sq-success">Кухня приймає запити точок.</span>
            ) : (
              <span className="text-sq-danger">
                Пауза{status.paused_until ? ` до ${clock(status.paused_until)}` : ' — до відновлення вручну'}. Точки бачать,
                що кухня не приймає.
              </span>
            )}
          </p>
        )}
        {status && (
          <div className="flex flex-wrap gap-2">
            {status.accepting ? (
              <>
                {PAUSES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="sq-btn-quiet"
                    disabled={busy}
                    onClick={() => void change({ accepting: false, pause_minutes: m }, `Пауза на ${m} хв`)}
                  >
                    Пауза {m} хв
                  </button>
                ))}
                <button
                  type="button"
                  className="sq-btn-quiet"
                  disabled={busy}
                  onClick={() => void change({ accepting: false }, 'Пауза до відновлення')}
                >
                  Пауза до відновлення
                </button>
              </>
            ) : (
              <button
                type="button"
                className="sq-btn-primary"
                disabled={busy}
                onClick={() => void change({ accepting: true }, 'Прийом відновлено')}
              >
                Відновити прийом
              </button>
            )}
          </div>
        )}
        {status && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-[13px] text-sq-secondary">
              Черга зараз, хв
              <input
                className="sq-input mt-1 w-28"
                inputMode="numeric"
                value={load}
                onChange={(e) => setLoad(e.target.value)}
              />
            </label>
            <button type="button" className="sq-btn-quiet" disabled={busy} onClick={saveLoad}>
              Зберегти чергу
            </button>
            <span className="text-[13px] text-sq-muted">Додається до часу кожної страви в пропозиції точці.</span>
          </div>
        )}
        {note && <p className={`text-[13px] ${note.ok ? 'text-sq-success' : 'text-sq-danger'}`}>{note.text}</p>}
      </div>

      <div className="space-y-2">
        <SectionHead title="Точки" count={cafes?.length} />
        {cafes === null && !note && <p className="text-[15px] text-sq-muted">Завантажую…</p>}
        <ul className="space-y-4" data-testid="rk-cafes">
          {(cafes ?? []).map((cafe) => (
            <li key={cafe.link_id}>
              <p className="text-[15px] font-semibold">
                {cafe.cafe_name}
                <span className="font-normal text-sq-muted">
                  {' '}
                  · {STATUS_TEXT[cafe.status]} · дорога {cafe.transit_minutes} хв
                </span>
              </p>
              {cafe.dishes.length === 0 ? (
                <p className="text-[13px] text-sq-secondary">Точка ще не обрала жодної страви кухні.</p>
              ) : (
                <p className="text-[13px] text-sq-secondary">
                  {cafe.dishes
                    .map((d) => `${d.label ? `${d.name} (${d.label})` : d.name}${d.prep_minutes != null ? ` ≈${d.prep_minutes} хв` : ''}`)
                    .join(', ')}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
